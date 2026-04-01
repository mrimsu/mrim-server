/**
 * @file Работа с контактами
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 * @author Neru Asano <neru.asano9667@gmail.com>
 */

const BinaryConstructor = require('../../../constructors/binary')
const {
  MessageConstructor,
  FieldDataType
} = require('../../../constructors/message')
const {
  MrimMessageCommands,
  MrimStatus,
  MrimContactFlags,
  MrimMessageFlags
} = require('../globals')
const {
  MrimContactList,
  MrimContactGroup,
  MrimLegacyContactList,
  MrimOldContact,
  MrimContact,
  MrimContactNewer,
  MrimContactWithMicroblog,
  MrimContactWithMicroblogNewer,
  MrimAddContactRequest,
  MrimAddContactResponse,
  MrimContactAuthorizeData,
  MrimModifyContactRequest,
  MrimModifyContactResponse
} = require('../../../messages/mrim/contact')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const { MrimServerMessageData } = require('../../../messages/mrim/messaging')
const {
  MrimUserStatusUpdate,
  MrimUserXStatusUpdate
} = require('../../../messages/mrim/status')
const {
  getContact,
  getContactGroups,
  getContactsFromGroups,
  createOrCompleteContact,
  addContactMSG,
  createNewGroup,
  modifyGroupName,
  deleteGroup,
  modifyContact,
  deleteContact,
  isContactAdder
} = require('../../../database')
const { _checkIfLoggedIn } = require('./core')
const config = require('../../../../config')
const { Iconv } = require('iconv')

async function generateLegacyContactList (containerHeader, userId, state = null) {
  const [contactGroups, contacts] = await Promise.all([
    getContactGroups(userId),
    getContactsFromGroups(userId)
  ])

  if (config.adminProfile?.enabled) {
    contacts.push({
      requester_is_adder: 1,
      requester_is_contact: 1,
      is_auth_success: 1,
      adder_group_id: 0,
      user_id: 0,
      user_login: config.adminProfile.username,
      user_domain: config.adminProfile.domain,
      user_nickname: config.adminProfile.nickname,
      contact_flags: 0
    })
  }

  // создаём группу

  const groupsBuffer = Buffer.alloc(0xa00, 0x00)
  contactGroups.forEach((contactGroup, index) => {
    if (index < 10 && contactGroup.name.length < 0x80 - 9) {
      const str = new Iconv('UTF-8', 'CP1251').convert(
        `00000000 ${contactGroup.name}`
      )
      Buffer.from(str).copy(groupsBuffer, index * 0x80)
      groupsBuffer.writeUInt8(0x0a, index * 0x80 + 0x7f)
    }
  })

  // контакты

  const contactsBuffers = contacts.flat().filter((contact) => {
    const requesterIsAdder = contact.requester_is_adder === 1 && contact.is_auth_success === 1
    return requesterIsAdder || contact.requester_is_contact === 1
  }).map((contact, index) => {
    let groupIndex = contactGroups.findIndex(
      (group) => contact.requester_is_adder
        ? group.id === contact.adder_group_id
        : group.id === contact.contact_group_id
    )

    if (groupIndex === -1) {
      groupIndex = 0
    }

    const nickname = contact.contact_nickname ?? contact.user_nickname ?? contact.user_login
    const nicknameLength = nickname.length.toString(16).padStart(2, '0')

    const groupIndexStr = groupIndex.toString(16).padStart(8, '0')
    const str = new Iconv('UTF-8', 'CP1251').convert(
      `00000000 ${groupIndexStr} ${contact.user_login}@${contact.user_domain} ${nicknameLength}${nickname}`
    )

    const buffer = Buffer.alloc(0x100, 0x00)
    Buffer.from(str).copy(buffer, 0)
    Buffer.from((!Number(contact.is_auth_success)).toString(16).padStart(4, '0')).copy(buffer, 0xfb) // server flag
    buffer.writeUInt8(0x0a, 0x100 - 1)
    return buffer
  })

  // объединяем

  const unitedBuffer = Buffer.concat([groupsBuffer, ...contactsBuffers])

  const contactList = MrimLegacyContactList.writer({
    contactsCount: 0,
    contactsLength: unitedBuffer.length,
    contacts: unitedBuffer
  }, false)

  return new BinaryConstructor()
    .subbuffer(
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.CONTACT_LIST_ACK,
        dataSize: contactList.length
      })
    )
    .subbuffer(contactList)
    .finish()
}

async function getOnlineStatusesLegacy (containerHeader, userId, state) {
  const contacts = await getContactsFromGroups(userId)

  const statuses = await contacts.flat().filter((contact) => {
    const requesterIsAdder = contact.requester_is_adder === 1 && contact.is_auth_success === 1
    return requesterIsAdder || contact.requester_is_contact === 1
  }).map((contact) => {
    const connectedContact = global.clients.find(
      ({ userId }) => userId === contact.user_id
    )

    let status = connectedContact?.status ??
      ((config.adminProfile?.username == contact.user_login &&
        config.adminProfile?.domain == contact.user_domain
      )
        ? 1
        : 0)

    const contactFlagsAsUser = contact.requester_is_adder
      ? contact.adder_flags
      : contact.contact_flags

    if (contactFlagsAsUser & MrimContactFlags.NEVER_VISIBLE || contactFlagsAsUser & MrimContactFlags.IGNORED) {
      status = 0
    } else if (connectedContact?.status === MrimStatus.INVISIBLE && contactFlagsAsUser & MrimContactFlags.ALWAYS_VISIBLE) { // Если Невидимка и "Я всегда видим для"
      status = connectedContact?.status
    }

    userStatusUpdate = MrimUserStatusUpdate.writer({
      status: status !== MrimStatus.XSTATUS ? status : MrimStatus.ONLINE,
      contact: `${contact.user_login}@${contact.user_domain}`
    })

    if (status != 0) {
      return new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_STATUS,
            dataSize: userStatusUpdate.length
          })
        )
        .subbuffer(userStatusUpdate)
        .finish()
    } else {
      return null
    }
  }).filter(item => item !== null)

  return statuses
}

async function processContactListRequest (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  logger.debug(`[${connectionId}] ${state.username} requests contact list (they're on very very old client of ancient greek)`)

  const contactList = await generateLegacyContactList(containerHeader, state.userId, state)
  const statuses = await getOnlineStatusesLegacy(containerHeader, state.userId, state)

  return {
    reply: [contactList, ...statuses]
  }
}

async function generateContactList (containerHeader, userId, state = null) {
  const [contactGroups, contacts] = await Promise.all([
    getContactGroups(userId),
    getContactsFromGroups(userId)
  ])

  let MRIM_CONTACT_MASK

  if (containerHeader.protocolVersionMinor >= 21) {
    MRIM_CONTACT_MASK = 'uussuussssusuuusssssu'
  } else if (containerHeader.protocolVersionMinor >= 20) {
    MRIM_CONTACT_MASK = 'uussuussssusuuusss'
  } else if (containerHeader.protocolVersionMinor >= 15) {
    MRIM_CONTACT_MASK = 'uussuussssus'
  } else if (containerHeader.protocolVersionMinor >= 8) {
    MRIM_CONTACT_MASK = 'uussuus'
  } else {
    MRIM_CONTACT_MASK = 'uussuu'
  }

  const MRIM_GROUP_MASK = 'us'

  let UTF16CAPABLE = false
  if (containerHeader.protocolVersionMinor >= 16 && state?.clientName !== 'QIP Infium') {
    UTF16CAPABLE = true
  }

  if (config.adminProfile?.enabled) {
    contacts.push({
      requester_is_adder: 1,
      requester_is_contact: 1,
      is_auth_success: 1,
      adder_group_id: 0,
      user_id: 0,
      user_login: config.adminProfile.username,
      user_domain: config.adminProfile.domain,
      user_nickname: config.adminProfile.nickname,
      contact_flags: 0
    })
  }

  const contactList = MrimContactList.writer({
    groupCount: contactGroups.length,
    groupFlag: MRIM_GROUP_MASK,
    contactFlag: MRIM_CONTACT_MASK,
    groups: Buffer.concat(
      contactGroups.map((contactGroup, index) =>
        MrimContactGroup.writer({
          groupFlags: MrimContactFlags.GROUP + (UTF16CAPABLE ? MrimContactFlags.UNICODE_NICKNAME : 0) +
                      (index * 0x1000000),
          name: contactGroup.name
        }, UTF16CAPABLE)
      )
    ),
    contacts: Buffer.concat(
      contacts.flat().filter((contact) => {
        const requesterIsAdder = contact.requester_is_adder === 1 && contact.is_auth_success === 1
        return requesterIsAdder || contact.requester_is_contact === 1
      }).map((contact) => {
        const groupIndex = contactGroups.findIndex(
          (group) => contact.requester_is_adder
            ? group.id === contact.adder_group_id
            : group.id === contact.contact_group_id
        )

        const connectedContact = global.clients.find(
          ({ userId }) => userId === contact.user_id
        )

        const contactFlags = contact.requester_is_adder
          ? contact.contact_flags
          : contact.adder_flags

        const contactFlagsAsUser = contact.requester_is_adder
          ? contact.adder_flags
          : contact.contact_flags

        if (contactFlags & MrimContactFlags.DELETED) {
          return null
        }

        let status = connectedContact?.status ??
          ((config.adminProfile?.username == contact.user_login &&
            config.adminProfile?.domain == contact.user_domain
          )
            ? 1
            : 0)

        if (contactFlagsAsUser & MrimContactFlags.NEVER_VISIBLE || contactFlagsAsUser & MrimContactFlags.IGNORED) {
          status = 0
        } else if (connectedContact?.status === MrimStatus.INVISIBLE && contactFlagsAsUser & MrimContactFlags.ALWAYS_VISIBLE) { // Если Невидимка и "Я всегда видим для"
          status = connectedContact?.status
        }

        const contactStructure = {
          contactFlags: contactFlags + (UTF16CAPABLE ? MrimContactFlags.UNICODE_NICKNAME : 0),
          groupIndex: groupIndex !== -1 ? groupIndex : 0,
          email: `${contact.user_login}@${contact.user_domain}`,
          login: contact.contact_nickname ??
              contact.user_nickname ??
              contact.user_login,
          authorized: Number(!contact.is_auth_success),
          status,
        }

        // добавляем новые поля в структуру контакта в зависимости от версии протокола

        if (containerHeader.protocolVersionMinor >= 20) {
          if (connectedContact) {
            contactStructure.microblogId = connectedContact?.microblog?.id ?? 0
            contactStructure.microblogUnixTime = connectedContact?.microblog?.date ?? 0
            contactStructure.microblogLastMessage = connectedContact?.microblog?.text ?? ''
          } else {
            if (contact.microblog_text !== null && contact.microblog_date > (Math.floor(Date.now() / 1000) - (60 * 60 * 24 * 7))) {
              contactStructure.microblogId = contact.microblog_id ?? 0
              contactStructure.microblogUnixTime = contact.microblog_date ?? 0
              contactStructure.microblogLastMessage = contact.microblog_text ?? ''
            }
          }
        }

        if (containerHeader.protocolVersionMinor >= 15) {
          contactStructure.xstatusType = connectedContact?.xstatus?.type ?? ''
          contactStructure.xstatusTitle = connectedContact?.xstatus?.title ?? ''
          contactStructure.xstatusDescription = connectedContact?.xstatus?.description ?? ''
          contactStructure.features = connectedContact?.features ?? 0x02FF
          contactStructure.userAgent = connectedContact?.userAgent ?? ''
        }

        // и тут отправляем в нужной структуре

        if (containerHeader.protocolVersionMinor >= 21) {
          return MrimContactWithMicroblogNewer.writer(contactStructure, UTF16CAPABLE)
        } else if (containerHeader.protocolVersionMinor >= 20) {
          return MrimContactWithMicroblog.writer(contactStructure, UTF16CAPABLE)
        } else if (containerHeader.protocolVersionMinor >= 15) {
          return MrimContactNewer.writer(contactStructure, UTF16CAPABLE)
        } else if (containerHeader.protocolVersionMinor >= 8) {
          return MrimContact.writer(contactStructure)
        } else {
          return MrimOldContact.writer(contactStructure)
        }
      }).filter(item => item !== null)
    )
  }, UTF16CAPABLE)

  return new BinaryConstructor()
    .subbuffer(
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.CONTACT_LIST2,
        dataSize: contactList.length
      })
    )
    .subbuffer(contactList)
    .finish()
}

async function processAddContact (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const request = MrimAddContactRequest.reader(packetData, state.utf16capable)

  let contactResponse
  let contactResult

  try {
    if (request.flags & MrimContactFlags.GROUP) {
      const groupName = request.contact === '' ? request.nickname : request.contact

      contactResult = await createNewGroup(state.userId, groupName)

      contactResponse = MrimAddContactResponse.writer({
        status: 0x0, // CONTACT_OPER_SUCCESS
        contactId: contactResult
      })
    } else {
      contactResult = await createOrCompleteContact(
        state.userId,
        request.contact.split('@')[0],
        request.contact.split('@')[1],
        request.nickname,
        request.flags,
        request.groupIndex
      )

      contactResponse = MrimAddContactResponse.writer({
        status: 0x0, // CONTACT_OPER_SUCCESS
        contactId: contactResult.contactId
      })

      const clientAddresser = global.clients.find(
        ({ username }) => username === request.contact.split('@')[0]
      )

      if (contactResult.action === 'CREATE_NEW') {
        logger.debug(`[${connectionId}] ${state.username}@${state.domain} sent CONTACT_ADD to ${request.contact}`)

        if (clientAddresser !== undefined) {
          const messageId = Math.floor(Math.random() + 0xFFFFFFFF)

          const message = MrimServerMessageData.writer({
            id: messageId,
            flags: MrimMessageFlags.NORECV + MrimMessageFlags.AUTHORIZE,
            addresser: `${state.username}@${state.domain}`,
            message: request.authMessage,
            messageRTF: ' '
          }, clientAddresser.utf16capable)

          clientAddresser.socket.write(
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetOrder: messageId,
                  packetCommand: MrimMessageCommands.MESSAGE_ACK,
                  dataSize: message.length
                })
              )
              .subbuffer(message)
              .finish()
          )
        }
      } else if (contactResult.action === 'MODIFY_EXISTING' && contactResult.authSuccess === true) {
        logger.debug(`[${connectionId}] ${state.username}@${state.domain} authorized ${request.contact}, congrats!`)

        // for contact

        if (clientAddresser !== undefined) {
          const authMessageForContact = MrimContactAuthorizeData.writer({
            contact: `${state.username}@${state.domain}`
          })

          let userStatusUpdateForContact

          if (clientAddresser.protocolVersionMinor >= 15) {
            userStatusUpdateForContact = MrimUserXStatusUpdate.writer({
              status: state.status,
              xstatusType: state.xstatus?.type ?? '',
              xstatusTitle: state.xstatus?.title ?? '',
              xstatusDescription: state.xstatus?.description ?? '',
              features: state.features ?? 0x02FF,
              userAgent: state.userAgent ?? '',
              contact: `${state.username}@${state.domain}`
            }, clientAddresser.utf16capable)
          } else {
            userStatusUpdateForContact = MrimUserStatusUpdate.writer({
              status: state.status !== 0x4 ? state.status : 0x1,
              contact: `${state.username}@${state.domain}`
            })
          }

          clientAddresser.socket.write(
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetOrder: Math.floor(Math.random() + 0xFFFFFFFF),
                  protocolVersionMinor: clientAddresser.protocolVersionMinor,
                  packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
                  dataSize: authMessageForContact.length
                })
              )
              .subbuffer(authMessageForContact)
              .finish()
          )

          clientAddresser.socket.write(
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetOrder: Math.floor(Math.random() + 0xFFFFFFFF),
                  protocolVersionMinor: clientAddresser.protocolVersionMinor,
                  packetCommand: MrimMessageCommands.USER_STATUS,
                  dataSize: userStatusUpdateForContact.length
                })
              )
              .subbuffer(userStatusUpdateForContact)
              .finish()
          )
        }

        // for user

        const authMessage = MrimContactAuthorizeData.writer({
          contact: request.contact
        })

        let userStatusUpdate, userStatusPacket

        // if they're online
        if (clientAddresser !== undefined) {
          if (state.protocolVersionMinor >= 15) {
            userStatusUpdate = MrimUserXStatusUpdate.writer({
              status: clientAddresser.status ?? 0x0,
              xstatusType: clientAddresser.xstatus?.type ?? '',
              xstatusTitle: clientAddresser.xstatus?.title ?? '',
              xstatusDescription: clientAddresser.xstatus?.description ?? '',
              features: clientAddresser.features ?? 0x02FF,
              userAgent: clientAddresser.userAgent ?? '',
              contact: request.contact
            }, state.utf16capable)
          } else {
            userStatusUpdate = MrimUserStatusUpdate.writer({
              status: (clientAddresser.status !== MrimStatus.XSTATUS
                ? clientAddresser.status
                : MrimStatus.ONLINE) ??
                MrimStatus.OFFLINE,
              contact: request.contact
            })
          }

          userStatusPacket = new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: Math.floor(Math.random() + 0xFFFFFFFF),
                packetCommand: MrimMessageCommands.USER_STATUS,
                dataSize: userStatusUpdate.length
              })
            )
            .subbuffer(userStatusUpdate)
            .finish()
        } else {
          userStatusPacket = null
        }

        return {
          reply: [
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetCommand: MrimMessageCommands.ADD_CONTACT_ACK,
                  dataSize: contactResponse.length
                })
              )
              .subbuffer(contactResponse)
              .finish(),
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetOrder: Math.floor(Math.random() + 0xFFFFFFFF),
                  packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
                  dataSize: authMessage.length
                })
              )
              .subbuffer(authMessage)
              .finish(),
            userStatusPacket
          ]
        }
      } else if (contactResult.action === 'MODIFY_EXISTING' && contactResult.authSuccess === false) {
        return {
          reply: [
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetCommand: MrimMessageCommands.ADD_CONTACT_ACK,
                  dataSize: contactResponse.length
                })
              )
              .subbuffer(contactResponse)
              .finish()
          ]
        }
      }
    }
  } catch (e) {
    logger.error(`[${connectionId}] ${e.stack}`)
    contactResponse = MrimAddContactResponse.writer({
      status: 0x00000001, // CONTACT_OPER_ERROR
      contactId: 0xffffffff
    })
  }

  if (contactResult !== undefined && !(request.flags & MrimContactFlags.GROUP)) {
    const client = global.clients.find(
      ({ username, domain }) => username === request.contact.split('@')[0] &&
                                domain === request.contact.split('@')[1]
    )

    if (contactResult?.action === 'MODIFY_EXISTING' && client) {
      const authorizeData = MrimContactAuthorizeData.writer({
        contact: `${state.username}@${state.domain}`
      })
      state.lastAuthorizedContact = request.contact

      client.socket.write(
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: 0,
              packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
              dataSize: authorizeData.length
            })
          )
          .subbuffer(authorizeData)
          .finish()
      )
    }
  }

  return {
    reply:
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.ADD_CONTACT_ACK,
            dataSize: contactResponse.length
          })
        )
        .subbuffer(contactResponse)
        .finish()
  }
}

async function processAuthorizeContact (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  // TODO: перенести это в contacts
  const MrimAddContactData = new MessageConstructor()
    .field('addresser', FieldDataType.UBIART_LIKE_STRING)
    .finish()

  const authorizePacket = MrimAddContactData.reader(packetData)

  const contactUsername = authorizePacket.addresser
  const clientAddresser = global.clients.find(
    ({ username, domain }) => username === contactUsername.split('@')[0] &&
                              domain === contactUsername.split('@')[1]
  )

  // Если юзер принял авторизацию
  if (isContactAdder(state.userId, contactUsername.split('@')[0], contactUsername.split('@')[1]) === true) {
    await addContactMSG(
      state.userId,
      contactUsername.split('@')[0],
      contactUsername.split('@')[1]
    )

    if (addContactMSG === false) {
      return
    }

    logger.debug(`[${connectionId}] ${state.username}@${state.domain} authorized ${contactUsername}, congrats!`)
    state.lastAuthorizedContact = contactUsername

    const authorizeReply = MrimAddContactData.writer({
      addresser: contactUsername
    })

    let statusPacket = null

    // if online
    if (clientAddresser !== undefined) {
      let statusReply

      if (state.protocolVersionMinor >= 15) {
        statusReply = MrimUserXStatusUpdate.writer({
          status: clientAddresser.status ?? 0x00,
          contact: contactUsername,
          xstatusType: clientAddresser.xstatus?.type ?? '',
          xstatusTitle: clientAddresser.xstatus?.title ?? '',
          xstatusDescription: clientAddresser.xstatus?.description ?? '',
          features: clientAddresser.features ?? 0x02FF,
          userAgent: clientAddresser.userAgent ?? ''
        })
      } else {
        statusReply = MrimUserStatusUpdate.writer({
          status: clientAddresser.status ?? 0x00,
          contact: contactUsername
        })
      }

      statusPacket = new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.CHANGE_STATUS,
            dataSize: statusReply.length
          })
        )
        .subbuffer(statusReply)
        .finish()
    }

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
              dataSize: authorizeReply.length
            })
          )
          .subbuffer(authorizeReply)
          .finish(),
        statusPacket
      ]
    }
  }
}

async function processModifyContact (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  let request = MrimModifyContactRequest.reader(packetData, state.utf16capable)

  // я щас начну логунги армянские выкрикивать на разработчика блять
  if (state.clientName === 'QIP Infium') {
    request = MrimModifyContactRequest.reader(packetData, true)
  }

  if ((request.contact.length === 0 && state.lastAuthorizedContact === undefined) || (config.adminProfile?.enabled &&
    request.contact === `${config.adminProfile?.username}@${config.adminProfile?.domain}`)) {
    const contactResponse = MrimModifyContactResponse.writer({
      status: 0x00000004 // CONTACT_OPER_INVALID_INFO
    })

    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.MODIFY_CONTACT_ACK,
            dataSize: contactResponse.length
          })
        )
        .subbuffer(contactResponse)
        .finish()
    }
  }

  const contactResponse = MrimModifyContactResponse.writer({
    status: 0x00000000 // CONTACT_OPER_SUCCESS
  })
  const reply = new BinaryConstructor()
    .subbuffer(
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.MODIFY_CONTACT_ACK,
        dataSize: contactResponse.length
      })
    )
    .subbuffer(contactResponse)
    .finish()

  if ((request.flags & 0x00000009) === 0x00000009 || (request.flags & 0x00000001) === 0x00000001) { // CONTACT_FLAG_REMOVED
    if (request.contact.length === 0) {
      request.contact = state.lastAuthorizedContact // я ебал разработчиков майл.ру ЭТО ПИЗДЕЦ
    }

    const isGroup = request.contact.split('@').length < 2

    if (isGroup) {
      await deleteGroup(state.userId, request.id, request)
    }

    if (!isGroup) {
      // если контакт в списке игнорируемых, ставим флаг что он якобы UDALEN (делитит)
      const contact = await getContact(state.userId, request.contact.split('@')[0], request.contact.split('@')[1])
      let contactFlagsAsUser

      try {
        contactFlagsAsUser = contact.requester_is_adder
            ? contact.adder_flags
            : contact.contact_flags
      } catch (e) {
        contactFlagsAsUser = 0
      }

      if (contactFlagsAsUser & MrimContactFlags.IGNORED) {
        await modifyContact(state.userId, request.contact.split('@')[0], request.contact.split('@')[1], '', MrimContactFlags.DELETED, 0)
      } else {
        const contactUserId = await deleteContact(
          state.userId,
          request.contact.split('@')[0],
          request.contact.split('@')[1]
        )

        // TODO: разобраться зачем это нужно тут
        if (contactUserId !== null) {
          await processChangeStatus(
            {
              protocolVersionMajor: state.protocolVersionMajor,
              protocolVersionMinor: state.protocolVersionMinor,
              packetOrder: 0
            },
            new BinaryConstructor()
              .integer(0, 4) // STATUS_OFFLINE
              .integer(0, 4)
              .integer(0, 4)
              .integer(0, 4)
              .integer(0xFF02, 4)
              .finish(),
            connectionId,
            logger,
            state,
            variables
          )
        }
      }
    }

    return { reply }
  }

  if ((request.flags & 0x00000002) === 0x00000002) { // CONTACT_FLAG_GROUP
    await modifyGroupName(state.userId, request.id, request.contact)
  } else {
    await modifyContact(
      state.userId,
      request.contact.split('@')[0],
      request.contact.split('@')[1],
      request.nickname,
      request.flags,
      request.groupIndex
    )
  }

  return { reply }
}

module.exports = { generateLegacyContactList, processContactListRequest, getOnlineStatusesLegacy, generateContactList, processAddContact, processAuthorizeContact, processModifyContact }
