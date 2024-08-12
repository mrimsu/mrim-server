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
const { MrimMessageCommands } = require('./globals')
const { MrimLoginData, MrimUserInfo } = require('../../messages/mrim/authorization')
const {
  MrimContactList,
  MrimContactGroup,
  MrimContact,
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
const { MrimChangeStatusRequest, MrimUserStatusUpdate } = require('../../messages/mrim/status')
const {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroups,
  createOrCompleteContact,
  searchUsers,
  createNewGroup,
  modifyGroupName,
  deleteGroup,
  modifyContact,
  deleteContact,
  modifyUserStatus,
  isContactAuthorized
} = require('../../database')
const config = require('../../../config')
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
const MRIM_CONTACT_FLAG = 'uussuus'

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
      .integer(config.mrim?.pingTimer ?? 5, 4)
      .finish()
  }
}

async function generateContactList (containerHeader, userId) {
  const [contactGroups, contacts] = await Promise.all([
    getContactGroups(userId),
    getContactsFromGroups(userId)
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
      contacts.flat().filter((contact) => {
        const requesterIsAdder = contact.requester_is_adder === 1 && contact.is_auth_success === 1
        return requesterIsAdder || contact.requester_is_contact === 1
      }).map((contact) => {
        const groupIndex = contactGroups.findIndex(
          (group) => contact.requester_is_adder
            ? group.id === contact.adder_group_id
            : group.id === contact.contact_group_id
        )
        return MrimContact.writer({
          groupIndex: groupIndex !== -1 ? groupIndex : 0xffffffff,
          email: `${contact.user_login}@mail.ru`,
          login: contact.contact_nickname ??
              contact.user_nickname ??
              contact.user_login,
          authorized: Number(!contact.is_auth_success),
          status: contact.contact_flags !== 4 // "Я всегда невидим для..."
            ? contact.user_status
            : 0, // STATUS_OFFLINE
          clientInfo: ''
          /* extendedStatusTitle: '',
          extendedStatusText: '',
          clientInfo: MRIM_J2ME_AGENT_CLIENT_INFO */
        })
      })
    )
  })

  return new BinaryConstructor()
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
    state.protocolVersionMajor = containerHeader.protocolVersionMajor
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    global.clients.push(state)
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
  const [contactList, _changeStatus] = await Promise.all([
    generateContactList(containerHeader, state.userId),
    processChangeStatus(
      containerHeader,
      new BinaryConstructor()
        .integer(state.status, 4)
        .finish(),
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
            packetCommand: MrimMessageCommands.USER_INFO,
            dataSize: userInfo.length,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .subbuffer(userInfo)
        .finish(),
      contactList
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

  const addresserClient = global.clients.find(
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
      case MrimSearchRequestFields.ONLINE:
        searchParameters.onlyOnline = true
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
  state,
  variables
) {
  const request = MrimAddContactRequest.reader(packetData)

  let contactResponse
  let contactResult

  try {
    contactResult = request.flags & 0x00000002 // CONTACT_FLAG_GROUP
      ? await createNewGroup(state.userId, request.contact)
      : await createOrCompleteContact(
        state.userId,
        request.contact.split('@')[0],
        request.nickname,
        request.flags,
        request.groupIndex
      )

    contactResponse = MrimAddContactResponse.writer({
      status: 0x00000000, // CONTACT_OPER_SUCCESS
      contactId: contactResult.contactId
    })
  } catch {
    contactResponse = MrimAddContactResponse.writer({
      status: 0x00000001, // CONTACT_OPER_ERROR
      contactId: 0xffffffff
    })
  }

  if (!(request.flags & 0x00000002)) {
    const client = global.clients.find(
      ({ username }) => username === request.contact.split('@')[0]
    )

    if (contactResult.action === 'MODIFY_EXISTING' && client) {
      const authorizeData = MrimContactAuthorizeData.writer({
        // TODO: закастомизировать это ЛИБО сделать выбор домена необязательным
        contact: state.username + '@mail.ru'  
      })
      state.lastAuthorizedContact = request.contact.split('@')[0]

      client.socket.write(
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: 0,
              packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
              dataSize: authorizeData.length,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .subbuffer(authorizeData)
          .finish()
      )
    }

    if (contactResult.action === 'CREATE_NEW') {
      const MrimAddContactData = new MessageConstructor()
        .field('unknown', FieldDataType.UINT32)
        .field('unknown2', FieldDataType.UINT32)
        .field('addresser', FieldDataType.UBIART_LIKE_STRING)
        .field('nickname', FieldDataType.UBIART_LIKE_STRING)
        .field('unknown3', FieldDataType.UINT32)
        .field('message', FieldDataType.UBIART_LIKE_STRING)
        .finish()

      const packedMessage = MrimAddContactData.reader(packetData)

      if (client) {
        const messageData = MrimServerMessageData.writer({
          id: Math.floor(Math.random() * 0xffffffff),
          flags: 0x08 + 0x04, // MESSAGE_FLAGS_AUTHORIZE + MESSAGE_FLAGS_NORECV
          addresser: state.username + '@mail.ru',
          message: packedMessage.message,
          messageRTF: ''
        })

        logger.debug(`[${connectionId}] ${state.username + '@mail.ru'} добавляется к ${request.contact.split('@')[0] + '@mail.ru'}. Данные в HEX: ${messageData.toString('hex')}`)

        client.socket.write(
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: Math.floor(Math.random() * 0xffffffff),
                packetCommand: MrimMessageCommands.MESSAGE_ACK,
                dataSize: messageData.length,
                senderAddress: 0,
                senderPort: 0
              })
            )
            .subbuffer(messageData)
            .finish()
        )
      }
    }
  }

  return {
    reply:
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
  const MrimAddContactData = new MessageConstructor()
    .field('addresser', FieldDataType.UBIART_LIKE_STRING)
    .finish()

  const authorizePacket = MrimAddContactData.reader(packetData)

  const contactUsername = authorizePacket.addresser.split('@')[0]
  const clientAddresser = global.clients.find(
    ({ username }) => username === contactUsername
  )

  if (clientAddresser !== undefined) {
    const authorizeToAddresser = MrimAddContactData.writer({
      addresser: `${state.username}@mail.ru`
    })

    // Отправлям адресату запрос на авторизацию
    clientAddresser.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
            dataSize: authorizeToAddresser.length,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .subbuffer(authorizeToAddresser)
        .finish()
    )
  }

  // Если юзер принял авторизацию
  if (await isContactAuthorized(state.userId, contactUsername) === true) {
    state.lastAuthorizedContact = contactUsername

    const authorizeReply = MrimAddContactData.writer({
      addresser: authorizePacket.addresser
    })

    const statusReply = MrimUserStatusUpdate.writer({
      status: clientAddresser.status ?? 0x00,
      contact: contactUsername + '@mail.ru'
    })

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
              dataSize: authorizeReply.length,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .subbuffer(authorizeReply)
          .finish(),
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetCommand: MrimMessageCommands.CHANGE_STATUS,
              dataSize: statusReply.length,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .subbuffer(statusReply)
          .finish()
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
  const request = MrimModifyContactRequest.reader(packetData)

  if (request.contact.length === 0 && state.lastAuthorizedContact === undefined) {
    const contactResponse = MrimModifyContactResponse.writer({
      status: 0x00000004 // CONTACT_OPER_INVALID_INFO
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

  const contactResponse = MrimModifyContactResponse.writer({
    status: 0x00000000 // CONTACT_OPER_SUCCESS
  })
  const reply = new BinaryConstructor()
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

  if ((request.flags & 0x00000009) === 0x00000009 || (request.flags & 0x00000001) === 0x00000001) { // CONTACT_FLAG_REMOVED
    if (request.contact.length === 0) {
      request.contact = state.lastAuthorizedContact // я ебал разработчиков майл.ру ЭТО ПИЗДЕЦ
    }

    const isGroup = request.contact.split('@').length < 2

    if (isGroup) {
      await deleteGroup(state.userId, request.id, request)
    }

    if (!isGroup) {
      const contactUserId = await deleteContact(
        state.userId,
        request.contact.split('@')[0]
      )

      if (contactUserId !== null) {
        await processChangeStatus(
          {
            protocolVersionMajor: state.protocolVersionMajor,
            protocolVersionMinor: state.protocolVersionMinor,
            packetOrder: 0
          },
          new BinaryConstructor()
            .integer(0, 4) // STATUS_OFFLINE
            .finish(),
          connectionId,
          logger,
          {
            ...state,
            __NO_DATABASE_EDIT_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: true,
            __ONLY_FOR_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: contactUserId,
            __IGNORE_AUTH_SUCCESS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: true
          },
          variables
        )
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
  let { status } = MrimChangeStatusRequest.reader(packetData)

  // пользователь хотит побыть невидимым
  if (status === 0x80000001) {
    status = 0 // STATUS_OFFLINE
  }

  const contacts = await getContactsFromGroups(state.userId)

  // TODO mikhail костыль на костыле
  const NO_DATABASE_EDIT = state.__NO_DATABASE_EDIT_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ?? false
  const IGNORE_AUTH_SUCCESS = state.__IGNORE_AUTH_SUCCESS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ?? false
  const ONLY_FOR = state.__ONLY_FOR_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ?? null

  if (!NO_DATABASE_EDIT) {
    await modifyUserStatus(state.userId, status)
  }

  for (const contact of contacts) {
    const client = global.clients.find(
      ({ userId }) => userId === contact.user_id
    )

    if (client === undefined || ONLY_FOR === client.userId) {
      continue
    }

    if (!IGNORE_AUTH_SUCCESS && contact.is_auth_success === 0) {
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

    logger.debug(`[${connectionId}] Обновление статуса у ${state.username}@mail.ru для ${contact.user_login}@mail.ru. Данные в HEX: ${userStatusUpdate.toString('hex')}`)
  }
}

module.exports = {
  processHello,
  processLogin,
  processSearch,
  processMessage,
  processAddContact,
  processModifyContact,
  processAuthorizeContact,
  processChangeStatus
}
