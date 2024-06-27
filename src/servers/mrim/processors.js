/**
 * @file Реализация процессоров запросов MRIM
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../constructors/binary')
const { MrimMessageCommands } = require('./globals')
const { MrimLoginData } = require('../../messages/mrim/authorization')
const {
  MrimContactList,
  MrimContactGroup,
  MrimContact,
  MrimAddContactRequest,
  MrimAddContactResponse,
  MrimContactAuthorize,
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
const { MrimChangeStatusRequest, MrimUserStatusUpdate } = require('../../messages/mrim/status')
const {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroups,
  addContactToGroup,
  searchUsers,
  createNewGroup,
  modifyGroupName,
  deleteGroup,
  moveContactToGroup,
  deleteContact,
  modifyUserStatus
} = require('../../database')
const { Iconv } = require('iconv')

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

const MRIM_GROUP_FLAG = 'us'
const MRIM_CONTACT_FLAG = 'uussuussssus'

const MRIM_J2ME_AGENT_CLIENT_INFO = 'client=J2MEAgent version=1.3 build=1937'

function processHello (containerHeader, connectionId, logger) {
  logger.debug(`[${connectionId}] Приветствуем клиента...`)

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
      .integer(10, 4)
      .finish()
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
  const loginData = MrimLoginData.reader(packetData)

  logger.debug(`[${connectionId}] !! Вход в аккаунт !!`)
  logger.debug(`[${connectionId}] Логин: ${loginData.login}`)
  logger.debug(`[${connectionId}] Пароль: ${loginData.password}`)
  logger.debug(`[${connectionId}] Статус: ${loginData.status}`)
  logger.debug(`[${connectionId}] Юзерагент: ${loginData.userAgent}`)

  try {
    state.userId = await getUserIdViaCredentials(
      loginData.login.split('@')[0],
      loginData.password
    )
    state.username = loginData.login.split('@')[0]
    state.status = loginData.status
    variables.clients.push(state)
  } catch {
    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.LOGIN_REJ,
            dataSize: 0,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .finish()
    }
  }

  // eslint-disable-next-line no-unused-vars
  const [contactGroups, contacts, _status] = await Promise.all([
    getContactGroups(state.userId),
    getContactsFromGroups(state.userId),
    modifyUserStatus(state.userId, loginData.status)
  ])

  const contactList = MrimContactList.writer({
    groupCount: contactGroups.length,
    groupFlag: MRIM_GROUP_FLAG,
    contactFlag: MRIM_CONTACT_FLAG,
    groups: Buffer.concat(
      contactGroups.map((contactGroup) =>
        MrimContactGroup.writer({
          name: contactGroup.name
        })
      )
    ),
    contacts: Buffer.concat(
      contacts.flat().map((contact) => {
        let isClientOnline = variables.clients.find(
          ({ userId }) => userId === contact.id
        )
        if (isClientOnline !== undefined) {
          // Отправляем пользователю сообщение о том что юзер онлайн

          /*
          const dataToSend = new BinaryConstructor()
            .integer(state.status, 4)
            .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // xstatus title i guess
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // xstatus desc
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8'))
            .integer((state.username + '@mail.ru').length, 4)
            .subbuffer(Buffer.from(`${state.username}@mail.ru`, 'utf-8'))
            .integer(0xFFFFFFFF, 4)
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // client text
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // unknown
            .finish()

          const dataToSendWithHeader = new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder,
                packetCommand: MrimMessageCommands.USER_STATUS,
                dataSize: dataToSend.length,
                senderAddress: 0,
                senderPort: 0
              })
            )
            .subbuffer(dataToSend)
            .finish()

          isClientOnline.socket.write(dataToSendWithHeader)
          */

          const userStatusUpdate = MrimUserStatusUpdate.writer({
            status: loginData.status,
            contact: `${state.username}@mail.ru`
          })

          isClientOnline.socket.write(
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetCommand: MrimMessageCommands.USER_STATUS,
                  dataSize: userStatusUpdate.length,
                  senderAddress: 0,
                  senderPort: 0
                })
              )
              .subbuffer(userStatusUpdate)
              .finish()
          )

          logger.debug(
            `[${connectionId}] Обновление статуса у ${state.username + '@mail.ru'} для ${contact.login + '@mail.ru'}. Данные в HEX: ${userStatusUpdate.toString('hex')}`
          )
          isClientOnline = isClientOnline.status
        } else {
          isClientOnline = 0
        }

        return MrimContact.writer({
          groupIndex: contactGroups.findIndex(
            (contactGroup) => contactGroup.id === contact.contact_group_id
          ),
          email: `${contact.login}@mail.ru`,
          login: contact.contact_nick ?? contact.nick ?? contact.login,
          status: isClientOnline, // ONLINE я думаю
          extendedStatusName: '',
          extendedStatusTitle: '',
          extendedStatusText: '',
          clientInfo: MRIM_J2ME_AGENT_CLIENT_INFO
        })
      })
    )
  })

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0,
        senderAddress: 0,
        senderPort: 0
      }),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.MAILBOX_STATUS,
            dataSize: 0x4,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .integer(0, 4)
        .finish(),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.CONTACT_LIST2,
            dataSize: contactList.length,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .subbuffer(contactList)
        .finish()
    ]
  }
}

function processMessage (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const messageData = MrimClientMessageData.reader(packetData)

  logger.debug(
    `[${connectionId}] Получено сообщение -> кому: ${messageData.addresser}, текст: ${messageData.message}`
  )

  const addresserClient = variables.clients.find(
    ({ username }) => username === messageData.addresser.split('@')[0]
  )
  if (addresserClient !== undefined) {
    const dataToSend = MrimServerMessageData.writer({
      id: 0x1337,
      flags: messageData.flags,
      addresser: state.username + '@mail.ru',
      message: messageData.message + ' ',
      messageRTF: messageData.messageRTF + ' '
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1337,
            packetCommand: MrimMessageCommands.MESSAGE_ACK,
            dataSize: dataToSend.length,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .integer(0, 4)
          .finish()
      ]
    }
  } else {
    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .integer(0x8006, 4)
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
            dataSize: 0x4,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .integer(AnketaInfoStatus.RATELIMITER, 4)
        .finish()
    }
  }

  const packetFields = {}

  while (packetData.length !== 0) {
    const field = MrimSearchField.reader(packetData)
    packetFields[field.key] = field.value

    // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
    const offset = MrimSearchField.writer(field).length
    packetData = packetData.subarray(offset)
  }

  logger.debug(`[${connectionId}] Клиент отправил запрос на поиск.`)
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
      case MrimSearchRequestFields.NICKNAME:
        searchParameters.nickname = value
        break
      case MrimSearchRequestFields.FIRSTNAME:
        searchParameters.firstName = value
        break
      case MrimSearchRequestFields.LASTNAME:
        searchParameters.lastName = value
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
    }
  }

  logger.debug(
    `[${connectionId}] searchParameters -> ${JSON.stringify(searchParameters)}`
  )
  const searchResults = await searchUsers(state.userId, searchParameters)

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
    Sex: 'sex'
  }

  const anketaHeader = MrimAnketaHeader.writer({
    status:
      searchResults.length > 0 ? AnketaInfoStatus.OK : AnketaInfoStatus.NOUSER,
    fieldCount: Object.keys(responseFields).length,
    maxRows: searchResults.length,
    serverTime: Math.floor(Date.now() / 1000)
  })

  let anketaInfo = new BinaryConstructor().subbuffer(anketaHeader)

  for (let key in responseFields) {
    key = new Iconv('UTF-8', 'CP1251').convert(key ?? 'unknown')
    anketaInfo = anketaInfo.integer(key.length, 4).subbuffer(key)
  }

  for (const user of searchResults) {
    user.birthday = user.birthday
      ? `${user.birthday.getFullYear()}-${user.birthday.getMonth().toString().padStart(2, '0')}-${user.birthday.getDate().toString().padStart(2, '0')}`
      : ''
    user.domain = 'mail.ru'

    for (const key of Object.values(responseFields)) {
      const value = new Iconv('UTF-8', 'CP1251').convert(
        Object.hasOwn(user, key) && user[key] !== null ? `${user[key]}` : ''
      )
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
          dataSize: anketaInfo.length,
          senderAddress: 0,
          senderPort: 0
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
  state
) {
  const request = MrimAddContactRequest.reader(packetData)
  request.flags = request.flags & 0x000000ff

  switch (request.flags) {
    case 0: {
      // добавление ИМЕННО контакта
      const contactId = await addContactToGroup(
        state.userId,
        request.groupIndex,
        request.contact.split('@')[0],
        request.nickname
      )

      const contactResponse = MrimAddContactResponse.writer({
        status: 0,
        contactId
      })
      const authorizeResponse = MrimContactAuthorize.writer({
        contact: request.contact
      })

      return {
        reply: [
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetCommand: MrimMessageCommands.ADD_CONTACT_ACK,
                dataSize: contactResponse.length,
                senderAddress: 0,
                senderPort: 0
              })
            )
            .subbuffer(contactResponse)
            .finish(),
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
                dataSize: authorizeResponse.length,
                senderAddress: 0,
                senderPort: 0
              })
            )
            .subbuffer(authorizeResponse)
            .finish()
        ]
      }
    }
    case 2: {
      const groupIndex = await createNewGroup(state.userId, request.contact)

      const contactResponse = MrimAddContactResponse.writer({
        status: 0,
        contactId: groupIndex
      })

      return {
        reply: new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetCommand: MrimMessageCommands.ADD_CONTACT_ACK,
              dataSize: contactResponse.length,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .subbuffer(contactResponse)
          .finish()
      }
    }
    default: {
      console.log(request.flags, request)
      const contactResponse = MrimAddContactResponse.writer({
        status: 1,
        contactId: 0xffffffff
      })

      return {
        reply: new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetCommand: MrimMessageCommands.ADD_CONTACT_ACK,
              dataSize: contactResponse.length,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .subbuffer(contactResponse)
          .finish()
      }
    }
  }
}

async function processModifyContact (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state
) {
  const request = MrimModifyContactRequest.reader(packetData)
  request.flags = request.flags & 0x000000ff

  switch (request.flags) {
    case 0:
    case 8: {
      // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
      if (request.contact.split('@').length < 2) {
        await modifyGroupName(state.userId, request.id, request.contact)
      } else {
        await moveContactToGroup(
          state.userId,
          request.groupIndex,
          request.contact.split('@')[0],
          request.nickname
        )
      }

      break
    }
    case 9: {
      // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
      if (request.contact.split('@').length < 2) {
        await deleteGroup(state.userId, request.id)
      } else {
        await deleteContact(state.userId, request.contact.split('@')[0])
      }
      break
    }
    default: {
      const contactResponse = MrimModifyContactResponse.writer({
        status: 1
      })

      return {
        reply: new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetCommand: MrimMessageCommands.MODIFY_CONTACT_ACK,
              dataSize: contactResponse.length,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .subbuffer(contactResponse)
          .finish()
      }
    }
  }

  const contactResponse = MrimModifyContactResponse.writer({ status: 0 })

  return {
    reply: new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          packetCommand: MrimMessageCommands.MODIFY_CONTACT_ACK,
          dataSize: contactResponse.length,
          senderAddress: 0,
          senderPort: 0
        })
      )
      .subbuffer(contactResponse)
      .finish()
  }
}

async function processChangeStatus (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const { status } = MrimChangeStatusRequest.reader(packetData)

  // eslint-disable-next-line no-unused-vars
  const [contacts, _status] = await Promise.all([
    getContactsFromGroups(state.userId),
    modifyUserStatus(state.userId, status)
  ])

  for (const contact of contacts) {
    const client = variables.clients.find(
      ({ userId }) => userId === contact.id
    )

    if (client === undefined) {
      continue
    }

    const userStatusUpdate = MrimUserStatusUpdate.writer({
      status,
      contact: `${state.username}@mail.ru`
    })

    client.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_STATUS,
            dataSize: userStatusUpdate.length,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .subbuffer(userStatusUpdate)
        .finish()
    )

    logger.debug(`[${connectionId}] Обновление статуса у ${state.username + '@mail.ru'} для ${contact.login + '@mail.ru'}. Данные в HEX: ${userStatusUpdate.toString('hex')}`)
  }
}

module.exports = {
  processHello,
  processLogin,
  processSearch,
  processMessage,
  processAddContact,
  processModifyContact,
  processChangeStatus
}
