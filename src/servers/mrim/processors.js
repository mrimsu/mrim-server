/**
 * @file Реализация процессоров запросов MRIM
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../constructors/binary')
const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')
const {
  MrimMessageCommands,
  MrimStatus,
  MrimContactFlags,
  MrimMessageFlags,
  MrimMessageErrors
} = require('./globals')
const {
  MrimOldLoginData,
  MrimLoginData,
  MrimNewerLoginData,
  MrimMoreNewerLoginData,
  MrimLoginThreeData,
  MrimRejectLoginData,
  MrimUserInfo
} = require('../../messages/mrim/authorization')
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
} = require('../../messages/mrim/contact')
const { MrimContainerHeader } = require('../../messages/mrim/container')
const {
  MrimClientMessageData,
  MrimServerMessageData
} = require('../../messages/mrim/messaging')
const {
  MrimSearchField,
  MrimAnketaHeader
} = require('../../messages/mrim/search')
const {
  MrimChangeStatusRequest,
  MrimChangeXStatusRequest,
  MrimUserStatusUpdate,
  MrimUserXStatusUpdate
} = require('../../messages/mrim/status')
const {
  MrimChangeMicroblogStatus,
  MrimMicroblogStatus
} = require('../../messages/mrim/microblog')
const { MrimGameData } = require('../../messages/mrim/games')
const { MrimFileTransfer, MrimFileTransferAnswer } = require('../../messages/mrim/files')
const { MrimCall, MrimCallAnswer } = require('../../messages/mrim/calls')
const {
  getUserIdViaCredentials,
  getContact,
  getContactGroups,
  getContactsFromGroups,
  createOrCompleteContact,
  addContactMSG,
  searchUsers,
  getIdViaLogin,
  createNewGroup,
  modifyGroupName,
  deleteGroup,
  modifyContact,
  deleteContact,
  getOfflineMessages,
  cleanupOfflineMessages,
  sendOfflineMessage,
  isContactAuthorized,
  isContactAdder,
  getMicroblogSettings
} = require('../../database')
const { getZodiacId } = require('../../tools/zodiac')
const config = require('../../../config')
const { Iconv } = require('iconv')
const https = require('https')

const MrimSearchRequestFields = {
  USER: 0,
  DOMAIN: 1,
  NICKNAME: 2,
  FIRSTNAME: 3,
  LASTNAME: 4,
  SEX: 5,
  DATE_MIN: 7,
  DATE_MAX: 8,
  CITY_ID: 11,
  ZODIAC: 12,
  BIRTHDAY_MONTH: 13,
  BIRTHDAY_DAY: 14,
  COUNTRY_ID: 15,
  ONLINE: 9
}

const AnketaInfoStatus = {
  NOUSER: 0,
  OK: 1,
  DBERR: 2,
  RATELIMITER: 3
}

function processHello (containerHeader, connectionId, logger) {
  logger.debug(`[${connectionId}] hello, stranger!`)

  const containerHeaderBinary = MrimContainerHeader.writer({
    ...containerHeader,
    packetOrder: 0,
    packetCommand: MrimMessageCommands.HELLO_ACK,
    dataSize: 0x4,
    senderAddress: 0,
    senderPort: 0
  })

  return {
    reply: new BinaryConstructor()
      .subbuffer(containerHeaderBinary)
      .integer(config.mrim?.pingTimer ?? 10, 4)
      .finish()
  }
}

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
          phoneNumber: ''
        }

        // добавляем новые поля в структуру контакта в зависимости от версии протокола

        if (containerHeader.protocolVersionMinor >= 20) {
          contactStructure.microblogId = connectedContact?.microblog?.text !== undefined ? 4 : 0
          contactStructure.microblogUnixTime = connectedContact?.microblog?.date ?? 0
          contactStructure.microblogLastMessage = connectedContact?.microblog?.text ?? ''
          
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

function _logoutPreviousClientIfNeeded (userId, containerHeader) {
  // NOTE https://storage.yandexcloud.net/schizophrenia/schizophrenia.jpg
  const previousClient = global.clients.find((client) => client.userId === userId)
  const previousClientIndex = global.clients.findIndex((client) => client.userId === userId)
  if (previousClient === undefined) return false

  const logoutMessage = new BinaryConstructor()
    .subbuffer(
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGOUT,
        dataSize: 4
      })
    )
    .integer(0x10, 4) // LOGOUT_NO_RELOGIN_FLAG
    .finish()
  previousClient.socket.end(logoutMessage)
  global.clients.splice(previousClientIndex, 1)

  return true
}

async function _processOfflineMessages (userId, containerHeader, logger, connectionId, state) {
  logger.debug(`[${connectionId}] pulling offline messages for userid = ${userId}...`)

  const offlineMessages = await getOfflineMessages(userId)

  offlineMessages.forEach((message) => {
    const messageId = Math.floor(Math.random() * 0xFFFFFFFF)
    const date = new Date(message.date * 1000)

    const messagePacket = MrimServerMessageData.writer({
      id: messageId,
      flags: MrimMessageFlags.OFFLINE,
      addresser: `${message.user_login}@${message.user_domain}`,
      message: `Offline Message from ${date.toISOString()} GMT:\n` +
               `${message.message}`,
      messageRTF: ' '
    }, state.utf16capable)

    const packet = new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          protocolVersionMinor: state.protocolVersionMinor,
          packetOrder: messageId,
          packetCommand: MrimMessageCommands.MESSAGE_ACK,
          dataSize: messagePacket.length
        })
      )
      .subbuffer(messagePacket)
      .finish()

    state.socket.write(packet)
  })

  logger.debug(`[${connectionId}] found ${offlineMessages.length} offline messages for userid = ${userId}`)
  cleanupOfflineMessages(userId)
}

async function processLegacyLogin (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let loginData

  loginData = MrimOldLoginData.reader(packetData)

  logger.debug(`[${connectionId}] ${loginData.login} tries to login using Legacy Login method...`)

  try {
    state.userId = await getUserIdViaCredentials(
      loginData.login.split('@')[0],
      loginData.login.split('@')[1],
      loginData.password
    )
    state.username = loginData.login.split('@')[0]
    state.domain = loginData.login.split('@')[1]
    state.status = 1
    state.protocolVersionMajor = containerHeader.protocolVersionMajor
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    state.connectionId = connectionId
    state.features = 0x005F
    state.utf16capable = false // old ass client

    // since this client doesn't say which version it is, we'll just guess
    if (containerHeader.protocolVersionMinor >= 4) {
      state.userAgent = 'client="magent" version="4.0"'
    } else if (containerHeader.protocolVersionMinor >= 2) {
      state.userAgent = 'client="magent" version="2.55"'
    } else if (containerHeader.protocolVersionMinor >= 0) {
      state.userAgent = 'client="magent" version="2.0"'
    }

    if (_logoutPreviousClientIfNeeded(state.userId, containerHeader)) {
      logger.debug(`[${connectionId}] kicking out ${state.username}'s older client`)
    }

    logger.debug(`[${connectionId}] login to ${loginData.login} succeed, sending info`)

    global.clients.push(state)
  } catch (e) {
    logger.debug(`[${connectionId}] login to ${loginData.login} failed: ${e.fatal === false ? 'database error / internal error' : 'invalid login/password'}`)

    let dataToSend
    if (e.fatal !== false) {
      dataToSend = MrimRejectLoginData.writer({
        reason: 'Invalid login'
      })
    } else {
      dataToSend = MrimRejectLoginData.writer({
        reason: 'Database error'
      })
    }

    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.LOGIN_REJ,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    }
  }

  const statusData = MrimChangeStatusRequest.writer({
    status: 1
  })

  // eslint-disable-next-line no-unused-vars
  const [contactList, statuses, _changeStatus] = await Promise.all([
    generateLegacyContactList(containerHeader, state.userId, state),
    getOnlineStatusesLegacy(containerHeader, state.userId, state),
    processChangeStatus(
      containerHeader,
      statusData,
      connectionId,
      logger,
      state,
      variables
    )
  ])

  const searchResults = await searchUsers(0, { login: state.username })

  const userInfo = MrimUserInfo.writer({
    nickname: searchResults[0].nick,
    messagestotal: '0', // dummy
    messagesunread: '0', // dummy
    clientip: '127.0.0.1:' + state.socket.remotePort
  }, state.utf16capable)

  _processOfflineMessages(state.userId, containerHeader, logger, connectionId, state)

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0
      }),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_INFO,
            dataSize: userInfo.length
          })
        )
        .subbuffer(userInfo)
        .finish(),
      contactList,
      ...statuses
    ]
  }
}

async function processLogin (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let loginData

  if (containerHeader.protocolVersionMinor >= 16) {
    loginData = MrimMoreNewerLoginData.reader(packetData, containerHeader.protocolVersionMinor >= 16)
  } else if (containerHeader.protocolVersionMinor >= 15) {
    loginData = MrimNewerLoginData.reader(packetData, containerHeader.protocolVersionMinor >= 16)
  } else {
    loginData = MrimLoginData.reader(packetData)
  }

  logger.debug(`[${connectionId}] ${loginData.login} tries to login using Login2 method...`)

  try {
    state.userId = await getUserIdViaCredentials(
      loginData.login.split('@')[0],
      loginData.login.split('@')[1],
      loginData.password
    )
    state.username = loginData.login.split('@')[0]
    state.domain = loginData.login.split('@')[1]
    state.status = loginData.status
    state.protocolVersionMajor = containerHeader.protocolVersionMajor
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    state.connectionId = connectionId
    state.userAgent = loginData.modernUserAgent ?? loginData.userAgent
    state.features = loginData.features

    if (containerHeader.protocolVersionMinor >= 15) {
      state.xstatus = {
        type: loginData.xstatusType,
        title: loginData.xstatusTitle,
        description: loginData.xstatusDescription
      }

      logger.debug(`[${connectionId}] xstatus: ${loginData.xstatusTitle} (${loginData.xstatusDescription})`)
    }

    if (loginData.modernUserAgent) {
      const agentRegex = RegExp('client="([A-Za-z0-9 ]+)"').exec(loginData.modernUserAgent)

      if (agentRegex.length > 1) {
        state.clientName = agentRegex[1]
      }
    }

    // софт из азербайджана писать не умеют хаха
    if (containerHeader.protocolVersionMinor >= 16 && state.clientName !== 'QIP Infium') {
      state.utf16capable = true
    } else {
      state.utf16capable = false
    }

    if (_logoutPreviousClientIfNeeded(state.userId, containerHeader)) {
      logger.debug(`[${connectionId}] kicking out ${state.username}'s older client`)
    }

    logger.debug(`[${connectionId}] login to ${loginData.login} succeed, sending info and contact list`)

    global.clients.push(state)
  } catch (e) {
    logger.debug(`[${connectionId}] login to ${loginData.login} failed: ${e.fatal === false ? 'database error / internal error' : 'invalid login/password'}`)

    let dataToSend
    if (e.fatal !== false) {
      dataToSend = MrimRejectLoginData.writer({
        reason: 'Invalid login'
      })
    } else {
      dataToSend = MrimRejectLoginData.writer({
        reason: 'Database error'
      })
    }

    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.LOGIN_REJ,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    }
  }

  let statusData

  if (containerHeader.protocolVersionMinor >= 15) {
    statusData = MrimChangeXStatusRequest.writer({
      status: state.status,
      xstatusType: state.xstatus?.type ?? '',
      xstatusTitle: state.xstatus?.title ?? '',
      xstatusDescription: state.xstatus?.description ?? '',
      xstatusState: state.xstatus?.state ?? 0x02FF // everything except videocalls
    }, state.utf16capable)
  } else {
    statusData = MrimChangeStatusRequest.writer({
      status: state.status
    })
  }

  // eslint-disable-next-line no-unused-vars
  const [contactList, _changeStatus] = await Promise.all([
    generateContactList(containerHeader, state.userId, state),
    processChangeStatus(
      containerHeader,
      statusData,
      connectionId,
      logger,
      state,
      variables
    )
  ])

  const searchResults = await searchUsers(0, { login: state.username })

  const userInfo = MrimUserInfo.writer({
    nickname: searchResults[0].nick,
    messagestotal: '0', // dummy
    messagesunread: '0', // dummy
    clientip: '127.0.0.1:' + state.socket.remotePort
  }, state.utf16capable)

  _processOfflineMessages(state.userId, containerHeader, logger, connectionId, state)

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0
      }),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_INFO,
            dataSize: userInfo.length
          })
        )
        .subbuffer(userInfo)
        .finish(),
      contactList
    ]
  }
}

async function processLoginThree (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  // проверка на ютф16 не нужна, потому что LOGIN3 используется только в MRIM => 1.21, который и так поддерживает его
  const loginData = MrimLoginThreeData.reader(packetData, true)

  logger.debug(`[${connectionId}] tries to login using Login3 method ${loginData.login}`)

  try {
    // в => MRIM 1.22 на кой то хуй используется MD5 пароль
    if (containerHeader.protocolVersionMinor >= 22) {
      const passwd = new Iconv('UTF-8', 'CP1251').convert(loginData.password).toString('hex').toLowerCase()
      state.userId = await getUserIdViaCredentials(
        loginData.login.split('@')[0],
        loginData.login.split('@')[1],
        passwd,
        true
      )
    } else {
      state.userId = await getUserIdViaCredentials(
        loginData.login.split('@')[0],
        loginData.login.split('@')[1],
        loginData.password
      )
    }
    state.username = loginData.login.split('@')[0]
    state.domain = loginData.login.split('@')[1]
    state.status = MrimStatus.ONLINE
    state.protocolVersionMajor = containerHeader.protocolVersionMajor
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    state.connectionId = connectionId
    state.userAgent = loginData.modernUserAgent ?? loginData.userAgent
    state.protocolVersionMinor = containerHeader.protocolVersionMinor

    // статус нам не передают, поэтому ставим дефолт
    state.xstatus = {
      type: 'STATUS_ONLINE',
      title: '',
      description: '',
      state: 0xFF03 // everything
    }

    // не проверяем, см. комментарий выше
    state.utf16capable = true

    if (_logoutPreviousClientIfNeeded(state.userId, containerHeader)) {
      logger.debug(`[${connectionId}] kicking out ${state.username}'s older client`)
    }

    logger.debug(`[${connectionId}] login to ${loginData.login} succeed, sending info and contact list`)

    global.clients.push(state)
  } catch (e) {
    logger.debug(`[${connectionId}] login to ${loginData.login} failed: ${e.fatal === false ? 'database error / internal error' : 'invalid login/password'}`)
    logger.debug(`${e.stack}`)
    let dataToSend
    if (e.fatal !== false) {
      dataToSend = MrimRejectLoginData.writer({
        reason: 'Invalid login'
      })
    } else {
      dataToSend = MrimRejectLoginData.writer({
        reason: 'Database error'
      })
    }

    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.LOGIN_REJ,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    }
  }

  // eslint-disable-next-line no-unused-vars
  const [contactList] = await Promise.all([
    generateContactList(containerHeader, state.userId)
  ])

  const searchResults = await searchUsers(0, { login: state.username })

  _processOfflineMessages(state.userId, containerHeader, logger, connectionId, state)

  const userInfo = MrimUserInfo.writer({
    nickname: searchResults[0].nick,
    messagestotal: '0', // dummy
    messagesunread: '0', // dummy
    clientip: '127.0.0.1:' + state.socket.remotePort
  }, state.utf16capable)

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0
      }),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_INFO,
            dataSize: userInfo.length
          })
        )
        .subbuffer(userInfo)
        .finish(),
      contactList
    ]
  }
}

async function processContactListRequest (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  logger.debug(`[${connectionId}] ${state.username} requests contact list (they're on very very old client of ancient greek)`)

  const contactList = await generateLegacyContactList(containerHeader, state.userId, state)
  const statuses = await getOnlineStatusesLegacy(containerHeader, state.userId, state)

  return {
    reply: [contactList, ...statuses]
  }
}

async function processMessage (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let messageData = MrimClientMessageData.reader(packetData, state.utf16capable)

  // фикс для азербайджанской разработки
  if (state.clientName === 'QIP Infium') {
    messageData = MrimClientMessageData.reader(packetData, true)
  }

  logger.debug(
    `[${connectionId}] sending message from ${state.username} to ${messageData.addresser}`
  )

  if (messageData.message.length > 5000) {
    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4
            })
          )
          .integer(MrimMessageErrors.TOO_MUCH, 4)
          .finish()
      ]
    }
  }

  if (config.adminProfile?.enabled && !(messageData.flags & 0x400) &&
    messageData.addresser === `${config.adminProfile?.username}@${config.adminProfile?.domain}`) {
    logger.debug(`[${connectionId}] user ${state.username} messaged to admin. 'll just send prepared message :)`)

    const dataToSend = MrimServerMessageData.writer({
      id: containerHeader.packetOrder + 1,
      flags: 0 + (state.utf16capable == true ? MrimMessageFlags.v1p16 : 0),
      addresser: `${config.adminProfile?.username}@${config.adminProfile?.domain}`,
      message: config.adminProfile.defaultMessage,
      messageRTF: ''
    }, state.utf16capable)

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4
            })
          )
          .integer(MrimMessageErrors.SUCCESS, 4)
          .finish(),

        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder + 1,
              packetCommand: MrimMessageCommands.MESSAGE_ACK,
              dataSize: dataToSend.length
            })
          )
          .subbuffer(dataToSend)
          .finish()
      ]
    }
  }

  if (messageData.flags & MrimMessageFlags.AUTHORIZE) {
    logger.debug(
      `[${connectionId}] auth request via MRIM_CS_MESSAGE from ${state.username}@${state.domain} to ${messageData.addresser}`
    )
    
    let authResult = await addContactMSG(
      state.userId,
      messageData.addresser.split('@')[0],
      messageData.addresser.split('@')[1]
    )

    if (authResult === true) {
      // TODO: перенести это в contacts
      const MrimAddContactData = new MessageConstructor()
        .field('addresser', FieldDataType.UBIART_LIKE_STRING)
        .finish()

      // сообщаем о такой прекрасной вести клиенту
      const contactUsername = messageData.addresser
      const clientAddresser = global.clients.find(
        ({ username, domain }) => username === contactUsername.split('@')[0] &&
                                  domain === contactUsername.split('@')[1]
      )

      if (clientAddresser !== undefined) {
        const authorizeReplyToContact = MrimAddContactData.writer({
          addresser: `${state.username}@${state.domain}`
        })

        clientAddresser.socket.write(
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
                dataSize: authorizeReplyToContact.length
              })
            )
            .subbuffer(authorizeReplyToContact)
            .finish()
        )
      }

      const authorizeReply = MrimAddContactData.writer({
        addresser: messageData.addresser
      })

      return {
        reply: [
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder,
                packetCommand: MrimMessageCommands.MESSAGE_STATUS,
                dataSize: 4
              })
            )
            .integer(MrimMessageErrors.SUCCESS, 4)
            .finish(),
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder+1,
                packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
                dataSize: authorizeReply.length
              })
            )
            .subbuffer(authorizeReply)
            .finish(),
          
        ]
      }
    }
  }

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === messageData.addresser.split('@')[0] &&
                  domain === messageData.addresser.split('@')[1]
  )

  if (addresserClient !== undefined) {
    const dataToSend = MrimServerMessageData.writer({
      id: Math.random() * 0xFFFFFFFF,
      flags: messageData.flags + (addresserClient.utf16capable == true ? MrimMessageFlags.v1p16 : 0),
      addresser: `${state.username}@${state.domain}`,
      message: messageData.message ?? ' ',
      messageRTF: messageData.messageRTF ?? ' '
    }, addresserClient.utf16capable)

    // send message UNTIL the proto version is less then 8 and "pers is typing" flag is set
    if (!(addresserClient.protocolVersionMinor <= 8 && messageData.flags & MrimMessageFlags.NOTIFY)) {
      addresserClient.socket.write(
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              protocolVersionMinor: addresserClient.protocolVersionMinor,
              packetOrder: Math.random() * 0xFFFFFFFF,
              packetCommand: MrimMessageCommands.MESSAGE_ACK,
              dataSize: dataToSend.length
            })
          )
          .subbuffer(dataToSend)
          .finish()
      )
    }

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4
            })
          )
          .integer(MrimMessageErrors.SUCCESS, 4)
          .finish()
      ]
    }
  } else {
    let messageStatus = MrimMessageErrors.SUCCESS
    let receiverId
    try {
      receiverId = await getIdViaLogin(messageData.addresser.split('@')[0], messageData.addresser.split('@')[1])
    } catch (e) {
      return {
        reply: [
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder,
                packetCommand: MrimMessageCommands.MESSAGE_STATUS,
                dataSize: 4
              })
            )
            .integer(MrimMessageErrors.NO_USER, 4)
            .finish()
        ]
      }
    }
    const messages = await getOfflineMessages(receiverId)

    if ([0x0, 0x80].includes(messageData.flags)) {
      if (messages.length > (config.mrim.offlineMessagesLimit ?? 20)) {
        messageStatus = MrimMessageErrors.OFFLINE_LIMIT
      } else {
        sendOfflineMessage(state.userId, receiverId, messageData.message)
        messageStatus = MrimMessageErrors.SUCCESS
      }
    } else {
      messageStatus = MrimMessageErrors.OFFLINE_DISABLED
    }

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4
            })
          )
          .integer(messageStatus, 4)
          .finish()
      ]
    }
  }
}

async function processSearch (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state
) {
  if (!state.searchRateLimiter) {
    state.searchRateLimiter = {
      available: 25,
      refreshTime: Date.now() + 15 * 60 * 60
    }
  }

  if (Date.now() > state.searchRateLimiter.refreshTime) {
    state.searchRateLimiter.available = 25
  }

  if (state.searchRateLimiter.available < 1) {
    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.ANKETA_INFO,
            dataSize: 0x4
          })
        )
        .integer(AnketaInfoStatus.RATELIMITER, 4)
        .finish()
    }
  }

  const packetFields = {}

  while (packetData.length >= 4) {
    try {
      const field = MrimSearchField.reader(packetData, false)
      packetFields[field.key] = field.value

      // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
      const offset = MrimSearchField.writer(field).length
      packetData = packetData.subarray(offset)
    } catch (e) {
      // вылезает OOB если неправильно сформирован запрос или закончились строки, скипаем
      break
    }
  }

  logger.debug(`[${connectionId}] ${state.username}@${state.domain} tried to search smth...`)
  logger.debug(
    `[${connectionId}] packetFields -> ${JSON.stringify(packetFields)}`
  )

  const searchParameters = {}

  for (let [key, value] of Object.entries(packetFields)) {
    key = parseInt(key, 10)

    switch (key) {
      case MrimSearchRequestFields.USER:
        searchParameters.login = value
        break
      case MrimSearchRequestFields.DOMAIN:
        searchParameters.domain = value
        break
      case MrimSearchRequestFields.NICKNAME:
        searchParameters.nickname = new Iconv(state.utf16capable ? 'UTF-16LE' : 'CP1251', 'UTF-8').convert(value.toString()).toString()
        break
      case MrimSearchRequestFields.FIRSTNAME:
        searchParameters.firstName = new Iconv(state.utf16capable ? 'UTF-16LE' : 'CP1251', 'UTF-8').convert(value.toString()).toString()
        break
      case MrimSearchRequestFields.LASTNAME:
        searchParameters.lastName = new Iconv(state.utf16capable ? 'UTF-16LE' : 'CP1251', 'UTF-8').convert(value.toString()).toString()
        break
      case MrimSearchRequestFields.DATE_MIN:
        searchParameters.minimumAge = parseInt(value, 10)
        break
      case MrimSearchRequestFields.DATE_MAX:
        searchParameters.maximumAge = parseInt(value, 10)
        break
      case MrimSearchRequestFields.ZODIAC:
        searchParameters.zodiac = parseInt(value, 10)
        break
      case MrimSearchRequestFields.BIRTHDAY_MONTH:
        searchParameters.birthmonth = parseInt(value, 10)
        break
      case MrimSearchRequestFields.BIRTHDAY_DAY:
        searchParameters.birthday = parseInt(value, 10)
        break
      case MrimSearchRequestFields.ONLINE:
        searchParameters.onlyOnline = true
        break
    }
  }

  logger.debug(
    `[${connectionId}] searchParameters -> ${JSON.stringify(searchParameters)}`
  )
  const searchResults = await searchUsers(state.userId, searchParameters, state.username === searchParameters.login)

  const responseFields = {
    Username: 'login',
    Nickname: 'nick',
    Domain: 'domain',
    FirstName: 'f_name',
    LastName: 'l_name',
    Location: 'location',
    Birthday: 'birthday',
    Zodiac: 'zodiac',
    Phone: 'phone',
    Sex: 'sex',
    status_title: 'status_title',
    status_desc: 'status_desc',
    mrim_status: 'mrim_status',
    status_uri: 'status_uri',
    country_id: 'country_id',
    city_id: 'city_id',
    bmonth: 'bmonth',
    bday: 'bday'
  }

  const anketaHeader = MrimAnketaHeader.writer({
    status:
      searchResults.length > 0 ? AnketaInfoStatus.OK : AnketaInfoStatus.NOUSER,
    fieldCount: Object.keys(responseFields).length,
    maxRows: searchResults.length,
    serverTime: Math.floor(Date.now() / 1000)
  }, state.utf16capable)

  let anketaInfo = new BinaryConstructor().subbuffer(anketaHeader)

  for (let key in responseFields) {
    // lol hardcode
    key = new Iconv('UTF-8', 'CP1251').convert(key ?? 'unknown')
    anketaInfo = anketaInfo.integer(key.length, 4).subbuffer(key)
  }

  for (const user of searchResults) {
    for (const key of Object.values(responseFields)) {
      let value = new Iconv('UTF-8', state.utf16capable && key !== 'birthday' && key !== 'domain' && key !== 'login' ? 'UTF-16LE' : 'CP1251').convert(
        Object.hasOwn(user, key) && user[key] !== null ? `${user[key]}` : ''
      )

      if (key === 'mrim_status') {
        value = new Iconv('UTF-8', 'CP1251').convert('3')
      }

      if (key === 'birthday') {
        let birthday = user.birthday
          ? `${user.birthday.getFullYear()}-${(user.birthday.getMonth() + 1).toString().padStart(2, '0')}-${user.birthday.getDate().toString().padStart(2, '0')}`
          : ''
        value = new Iconv('UTF-8', 'CP1251').convert(birthday)
      }

      if (key === 'zodiac') {
        value = new Iconv('UTF-8', 'CP1251').convert(`${getZodiacId(user.birthday)}`)
      }

      anketaInfo = anketaInfo.integer(value.length, 4).subbuffer(value)
    }
  }

  anketaInfo = anketaInfo.finish()

  state.searchRateLimiter.available--

  return {
    reply: new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          packetCommand: MrimMessageCommands.ANKETA_INFO,
          dataSize: anketaInfo.length
        })
      )
      .subbuffer(anketaInfo)
      .finish()
  }
}

async function processAddContact (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
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

async function processChangeStatus (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let status

  if (containerHeader.protocolVersionMinor >= 15) {
    // костыль для азербайджанской разработки
    if (state.clientName === 'QIP Infium') {
      status = MrimChangeXStatusRequest.reader(packetData, true)
    } else {
      status = MrimChangeXStatusRequest.reader(packetData, state.utf16capable)
    }
  } else {
    status = MrimChangeStatusRequest.reader(packetData)
  }

  state.status = status.status

  if (status.status === 0x4) {
    state.xstatus.type = status.xstatusType
    state.xstatus.title = status.xstatusTitle
    state.xstatus.description = status.xstatusDescription
  }

  logger.debug(`[${connectionId}] new status for ${state.username}@${state.domain} -> ${status.status} / X-status: ${status.xstatusTitle ?? ''} (${status.xstatusDescription ?? ''})`)

  const contacts = await getContactsFromGroups(state.userId)

  for (const contact of contacts) {
    const client = global.clients.find(
      ({ userId }) => userId === contact.user_id
    )

    if (client === undefined) {
      continue
    }

    if (contact.is_auth_success === 0) {
      continue
    }

    // если статус невидимый
    const contactFlags = contact.requester_is_adder
      ? contact.contact_flags
      : contact.adder_flags

    if (status.status === MrimStatus.INVISIBLE &&
      (contactFlags & MrimContactFlags.NEVER_VISIBLE || contactFlags & MrimContactFlags.IGNORED)) {
      continue
    } else if (status.status === MrimStatus.INVISIBLE && !(contactFlags & MrimContactFlags.ALWAYS_VISIBLE)) {
      status.status = 0
      status.xstatusType = ''
      status.xstatusTitle = ''
      status.xstatusDescription = ''
    }

    let userStatusUpdate

    if (client.protocolVersionMinor >= 15) {
      userStatusUpdate = MrimUserXStatusUpdate.writer({
        status: status.status,
        xstatusType: status.xstatusType ?? '',
        xstatusTitle: status.xstatusTitle ?? '',
        xstatusDescription: status.xstatusDescription ?? '',
        features: state.features ?? 0x02FF,
        userAgent: state.userAgent ?? '',
        contact: `${state.username}@${state.domain}`
      }, client.utf16capable)
    } else {
      userStatusUpdate = MrimUserStatusUpdate.writer({
        status: status.status !== MrimStatus.XSTATUS ? status.status : MrimStatus.ONLINE,
        contact: `${state.username}@${state.domain}`
      })
    }

    client.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_STATUS,
            dataSize: userStatusUpdate.length
          })
        )
        .subbuffer(userStatusUpdate)
        .finish()
    )

    logger.debug(`[${connectionId}] 'll send ${state.username}@${state.domain}'s new status to ${contact.user_login}@${contact.user_domain}`)
  }
}

async function processGame (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const pakcet = MrimGameData.reader(packetData)

  // так ну неплохо надо бы переправить данный пакет нужному получателю
  const addresserClient = global.clients.find(
    ({ username, domain }) => username === pakcet.addresser_or_receiver.split('@')[0] &&
                              domain === pakcet.addresser_or_receiver.split('@')[1]
  )

  if (addresserClient !== undefined) {
    // basically we're just pushin same data to client
    const dataToSend = MrimGameData.writer({
      addresser_or_receiver: `${state.username}@${state.domain}`,
      session: pakcet.session,
      internal_msg: pakcet.internal_msg,
      message_id: pakcet.message_id,
      data: pakcet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1337,
            packetCommand: MrimMessageCommands.GAME,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimGameData.writer({
          addresser_or_receiver: pakcet.addresser_or_receiver,
          session: pakcet.session,
          internal_msg: 10, // means no user found bruv
          message_id: pakcet.message_id,
          data: ''
        })
    }
  }
}

async function processFileTransfer (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const packet = MrimFileTransfer.reader(packetData)

  // так ну неплохо надо бы переправить данный пакет нужному получателю
  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined) {
    // иииииииии мы тупо шлём тоже самое блять)
    const dataToSend = MrimFileTransfer.writer({
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      files_size: packet.files_size,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1337,
            packetCommand: MrimMessageCommands.FILE_TRANSFER,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimFileTransferAnswer.writer({
          status: 2, // Unknown error
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id,
          data: ''
        })
    }
  }
}

async function processFileTransferAnswer (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const packet = MrimFileTransferAnswer.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined || packet.status !== 4) {
    const dataToSend = MrimFileTransferAnswer.writer({
      status: packet.status,
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1488,
            packetCommand: MrimMessageCommands.FILE_TRANSFER_ACK,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimFileTransferAnswer.writer({
          status: 2, // Unknown error
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id,
          data: ''
        })
    }
  }
}

async function processCall (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const packet = MrimCall.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined || packet.status !== 4) {
    const dataToSend = MrimCall.writer({
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x228,
            packetCommand: MrimMessageCommands.CALL2,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimCallAnswer.writer({
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id,
          status: 0 // Unknown error
        })
    }
  }
}

async function processCallAnswer (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const packet = MrimCallAnswer.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined) {
    const dataToSend = MrimCallAnswer.writer({
      status: packet.status,
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x265,
            packetCommand: MrimMessageCommands.CALL_ACK,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimCall.writer({
          status: 2, // Unknown error
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id
        })
    }
  }
}

async function processNewMicroblog (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const microblog = MrimChangeMicroblogStatus.reader(packetData, state.utf16capable)

  // TODO: logic to send it to external social networks

  const microblogSettings = await getMicroblogSettings(state.userId)

  // openvk

  if (microblogSettings.type === 'openvk') {
    try {
      const opt = {
        hostname: microblogSettings.instance,
        port: 443,
        path: '/method/wall.post?' +
          'owner_id=' + microblogSettings.userId +
          '&message=' + encodeURIComponent(microblog.text) +
          '&access_token=' + microblogSettings.token,
        method: 'GET'
      }

      https.get(opt, (res) => {
        res.setEncoding('utf8')
        let responseBody = ''

        res.on('data', (chunk) => {
          responseBody += chunk
        })

        res.on('end', () => {
          logger.debug(`[${connectionId}] posted to OpenVK: ${responseBody}`)
        })
      })
    } catch (e) {
      logger.error(`[${connectionId}] failed to post to OpenVK: ${e.stack}`)
    }
  }

  state.microblog = {
    text: microblog.text,
    date: Math.floor(Date.now() / 1000)
  } 

  state.xstatus.description = microblog.text // duplication for older clients

  logger.debug(`[${connectionId}] new microblog post from ${state.username}@${state.domain} -> ${microblog.text}`)

    const userMicroblogUpdate = MrimMicroblogStatus.writer({
      flags: microblog.flags,
      contact: `${state.username}@${state.domain}`,
      text: microblog.text,
      id: 42,
      time: Math.floor(Date.now() / 1000)
    }, true)

  const contacts = await getContactsFromGroups(state.userId)

  for (const contact of contacts) {
    const client = global.clients.find(
      ({ userId }) => userId === contact.user_id
    )

    if (client === undefined) {
      continue
    }

    if (contact.is_auth_success === 0) {
      continue
    }

    if (client.protocolVersionMinor < 20) {
      continue
    }

    // если статус невидимый
    const contactFlags = contact.requester_is_adder
      ? contact.contact_flags
      : contact.adder_flags

    if (contactFlags & MrimContactFlags.NEVER_VISIBLE || contactFlags & MrimContactFlags.IGNORED) {
      continue
    }

    client.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_BLOG_STATUS,
            dataSize: userMicroblogUpdate.length
          })
        )
        .subbuffer(userMicroblogUpdate)
        .finish()
    )

    logger.debug(`[${connectionId}] 'll send ${state.username}@${state.domain}'s new microblog post to ${contact.user_login}@${contact.user_domain}`)
  }

  return {
    reply: 
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_BLOG_STATUS,
            dataSize: userMicroblogUpdate.length
          })
        )
        .subbuffer(userMicroblogUpdate)
        .finish()
    }
}

module.exports = {
  processHello,
  processLegacyLogin,
  processLogin,
  processLoginThree,
  processContactListRequest,
  processSearch,
  processMessage,
  processAddContact,
  processModifyContact,
  processAuthorizeContact,
  processChangeStatus,
  processGame,
  processFileTransfer,
  processFileTransferAnswer,
  processCall,
  processCallAnswer,
  processNewMicroblog
}
