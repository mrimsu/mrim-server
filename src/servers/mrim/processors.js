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
const { 
  MrimLoginData, 
  MrimNewerLoginData, 
  MrimMoreNewerLoginData,
  MrimLoginThreeData, 
  MrimRejectLoginData,
  MrimUserInfo } = require('../../messages/mrim/authorization')
const {
  MrimContactList,
  MrimContactGroup,
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
const { MrimGameData } = require('../../messages/mrim/games')
const { MrimFileTransfer, MrimFileTransferAnswer } = require('../../messages/mrim/files')
const { MrimCall, MrimCallAnswer } = require('../../messages/mrim/calls')
const {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroups,
  createOrCompleteContact,
  addContactMSG,
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
const { log } = require('winston')

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
      .integer(config.mrim?.pingTimer ?? 10, 4)
      .finish()
  }
}

async function generateContactList (containerHeader, userId) {
  const [contactGroups, contacts] = await Promise.all([
    getContactGroups(userId),
    getContactsFromGroups(userId)
  ])

  let MRIM_CONTACT_FLAG;
  
  if (containerHeader.protocolVersionMinor >= 21) {
    MRIM_CONTACT_FLAG = 'uussuussssusuuusssssu'
  } else if (containerHeader.protocolVersionMinor >= 20) {
    MRIM_CONTACT_FLAG = 'uussuussssusuuusss'
  } else if (containerHeader.protocolVersionMinor >= 15) {
    MRIM_CONTACT_FLAG = 'uussuussssus'
  } else if (containerHeader.protocolVersionMinor >= 8) {
    MRIM_CONTACT_FLAG = 'uussuus'
  } else {
    MRIM_CONTACT_FLAG = 'uussuu'
  }

  let UTF16CAPABLE = false;
  if (containerHeader.protocolVersionMinor >= 16) {
    UTF16CAPABLE = true;
  }

  if (config.adminProfile?.enabled) {
    contacts.push({
      requester_is_adder: 1,
      requester_is_contact: 1,
      is_auth_success: 1,
      adder_group_id: 0,
      user_id: 0,
      user_login: config.adminProfile.username,
      user_nickname: config.adminProfile.nickname,
      contact_flags: 0
    })
  }

  const contactList = MrimContactList.writer({
    groupCount: contactGroups.length,
    groupFlag: MRIM_GROUP_FLAG,
    contactFlag: MRIM_CONTACT_FLAG,
    groups: Buffer.concat(
      contactGroups.map((contactGroup) =>
        MrimContactGroup.writer({
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

        let contactStructure = {
          groupIndex: groupIndex !== -1 ? groupIndex : 0xffffffff,
          email: `${contact.user_login}@mail.ru`,
          login: contact.contact_nickname ??
              contact.user_nickname ??
              contact.user_login,
          authorized: Number(!contact.is_auth_success),
          status: contact.contact_flags !== 4 // "Я всегда невидим для..."
            ? (connectedContact?.status ?? (config.adminProfile?.username == contact.user_login ? 1 : 0))
            : 0, // STATUS_OFFLINE
          phoneNumber: ''
        };

        // добавляем новые поля в структуру контакта в зависимости от версии протокола

        if (containerHeader.protocolVersionMinor >= 15) {
            contactStructure.xstatusType = connectedContact?.xstatus?.type ?? ""
            contactStructure.xstatusTitle = connectedContact?.xstatus?.title ?? ""
            contactStructure.xstatusDescription = connectedContact?.xstatus?.description ?? ""
            contactStructure.features = connectedContact?.xstatus?.state ?? 767
            contactStructure.userAgent = connectedContact?.userAgent ?? ""
        }

        // и тут отправляем в нужной структуре

        if (containerHeader.protocolVersionMinor >= 21) {
          return MrimContactWithMicroblogNewer.writer(contactStructure, UTF16CAPABLE)
        } else if (containerHeader.protocolVersionMinor >= 20) {
          return MrimContactWithMicroblog.writer(contactStructure, UTF16CAPABLE)
        } else if (containerHeader.protocolVersionMinor >= 15) {
          return MrimContactNewer.writer(contactStructure, UTF16CAPABLE)
        } else {
          return MrimContact.writer(contactStructure)
        }

      })
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

async function processLogin (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  var loginData;

  if (containerHeader.protocolVersionMinor >= 16) {
    loginData = MrimMoreNewerLoginData.reader(packetData, containerHeader.protocolVersionMinor >= 16 ? true : false)
  } else if (containerHeader.protocolVersionMinor >= 15) {
    loginData = MrimNewerLoginData.reader(packetData, containerHeader.protocolVersionMinor >= 16 ? true : false)
  } else {
    loginData = MrimLoginData.reader(packetData)
  }

  logger.debug(`[${connectionId}] Вход в аккаунт через Login2: ${loginData.login}`)

  try {
    state.userId = await getUserIdViaCredentials(
      loginData.login.split('@')[0],
      loginData.password
    )
    state.username = loginData.login.split('@')[0]
    state.status = loginData.status
    state.protocolVersionMajor = containerHeader.protocolVersionMajor
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    state.connectionId = connectionId
    state.userAgent = loginData.modernUserAgent ?? loginData.userAgent
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    if (containerHeader.protocolVersionMinor >= 15) {
      state.xstatus = {
        "type": loginData.xstatusType,
        "title": loginData.xstatusTitle,
        "description": loginData.xstatusDescription,
        "state": loginData.features,
      }

      logger.debug(`[${connectionId}] Статус: ${loginData.xstatusTitle} (${loginData.xstatusDescription})`);
    }
    if (containerHeader.protocolVersionMinor >= 16) {
      state.utf16capable = true;
    } else {
      state.utf16capable = false;
    }

    if (_logoutPreviousClientIfNeeded(state.userId, containerHeader)) {
      logger.info(`сервер послал НАХУЙ пользователя ${state.username} по первому клиенту`)
    }

    logger.debug(`[${connectionId}] Вход в ${loginData.login} удался, отправляем инфу и контакт-лист`);

    global.clients.push(state)
  } catch (e) {
    logger.debug(`[${connectionId}] Вход в ${loginData.login} зафейлился: ` + (e.fatal === false ? 'ошибка базы данных / внутренняя ошибка' : 'неверный логин/пароль'));

    let dataToSend
    if (e.fatal !== false) {
      dataToSend = MrimRejectLoginData.writer({
        reason: "Invalid login"
      });
    } else {
      dataToSend = MrimRejectLoginData.writer({
        reason: "Database error"
      });
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

  let statusData;

  if (containerHeader.protocolVersionMinor >= 15) {
    statusData = MrimChangeXStatusRequest.writer({
      status: state.status,
      xstatusType: state.xstatus?.type ?? "",
      xstatusTitle: state.xstatus?.title ?? "",
      xstatusDescription: state.xstatus?.description ?? "",
      xstatusState: state.xstatus?.state ?? 767 // 02 FF -- everything except videocalls
    }, state.utf16capable);
  } else {
    statusData = MrimChangeStatusRequest.writer({
      status: state.status
    });
  }

  // eslint-disable-next-line no-unused-vars
  const [contactList, _changeStatus] = await Promise.all([
    generateContactList(containerHeader, state.userId),
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
  var loginData;

  // TODO: MD5 check

  // проверка на ютф16 не нужна, потому что LOGIN3 используется только в MRIM => 1.21, который и так поддерживает его
  loginData = MrimLoginThreeData.reader(packetData, true)

  logger.debug(`[${connectionId}] Вход в аккаунт через Login3: ${loginData.login}`)

  try {
    // в => MRIM 1.22 на кой то хуй используется MD5 пароль
    if (containerHeader.protocolVersionMinor >= 22) {
      let passwd =  new Iconv('UTF-8', 'CP1251').convert(loginData.password).toString('hex').toLowerCase();
      state.userId = await getUserIdViaCredentials(
        loginData.login.split('@')[0],
        passwd,
        true
      )
    } else {
      state.userId = await getUserIdViaCredentials(
        loginData.login.split('@')[0],
        loginData.password
      )
    }
    state.username = loginData.login.split('@')[0]
    state.status = 1 // STATUS_ONLINE
    state.protocolVersionMajor = containerHeader.protocolVersionMajor
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    state.connectionId = connectionId
    state.userAgent = loginData.modernUserAgent ?? loginData.userAgent
    state.protocolVersionMinor = containerHeader.protocolVersionMinor

    // статус нам не передают, поэтому ставим дефолт
    state.xstatus = {
      "type": "STATUS_ONLINE",
      "title": "",
      "description": "",
      "state": 0xFF03, // everything
    }

    // не проверяем, см. комментарий выше
    state.utf16capable = true;

    if (_logoutPreviousClientIfNeeded(state.userId, containerHeader)) {
      logger.info(`сервер послал НАХУЙ пользователя ${state.username} по первому клиенту`)
    }

    logger.debug(`[${connectionId}] Вход в ${loginData.login} удался, отправляем инфу и контакт-лист`);

    global.clients.push(state)
  } catch (e) {
    logger.debug(`[${connectionId}] Вход в ${loginData.login} зафейлился: ` + e.fatal === false ? 'ошибка базы данных / внутренняя ошибка' : 'неверный логин/пароль');

    let dataToSend
    if (e.fatal !== false) {
      dataToSend = MrimRejectLoginData.writer({
        reason: "Invalid login"
      });
    } else {
      dataToSend = MrimRejectLoginData.writer({
        reason: "Database error"
      });
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

function processMessage (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const messageData = MrimClientMessageData.reader(packetData, state.utf16capable)

  logger.debug(
    `[${connectionId}] Команда: сообщение от ${state.username} для ${messageData.addresser}`
  )

  if (config.adminProfile?.enabled && messageData.addresser.split('@')[0] === config.adminProfile?.username && !(messageData.flags & 0x400)) {
    logger.debug(`[${connectionId}] Юзер ${state.username} написал админу. Отправляем заготовленное письмо :)`)
    
    const dataToSend = MrimServerMessageData.writer({
      id: 0x1337,
      flags: 0x40, // system message
      addresser: config.adminProfile?.username + '@mail.ru',
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
          .integer(0, 4)
          .finish(),

        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder+1,
              packetCommand: MrimMessageCommands.MESSAGE_ACK,
              dataSize: dataToSend.length
            })
          )
          .subbuffer(dataToSend)
          .finish()
      ]
    }
  }

  if (messageData.flags & 0x8) { // Запрос на авторизацию
    logger.debug(
      `[${connectionId}] Запрос на авторизацию от ${state.username} для ${messageData.addresser}`
    )
    addContactMSG(
      state.userId,
      messageData.addresser.split('@')[0]
    )
  }

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
    }, addresserClient.utf16capable)

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1337,
            packetCommand: MrimMessageCommands.MESSAGE_ACK,
            dataSize: dataToSend.length
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
              dataSize: 4
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
              dataSize: 4
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
  const searchResults = await searchUsers(state.userId, searchParameters, state.username === searchParameters.login ? true : false)

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
  }, state.utf16capable)

  let anketaInfo = new BinaryConstructor().subbuffer(anketaHeader)

  for (let key in responseFields) {
    // lol hardcode
    key = new Iconv('UTF-8', 'CP1251').convert(key ?? 'unknown')
    anketaInfo = anketaInfo.integer(key.length, 4).subbuffer(key)
  }

  for (const user of searchResults) {
    user.birthday = user.birthday
      ? `${user.birthday.getFullYear()}-${(user.birthday.getMonth() + 1).toString().padStart(2, '0')}-${user.birthday.getDate().toString().padStart(2, '0')}`
      : ''
    user.domain = 'mail.ru'

    for (const key of Object.values(responseFields)) {
      const value = new Iconv('UTF-8', state.utf16capable && key !== 'birthday' && key !== 'domain' && key !== 'login' ? 'UTF-16LE' : 'CP1251').convert(
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

  if (contactResult !== undefined && !(request.flags & 0x00000002)) {
    const client = global.clients.find(
      ({ username }) => username === request.contact.split('@')[0]
    )

    if (contactResult?.action === 'MODIFY_EXISTING' && client) {
      const authorizeData = MrimContactAuthorizeData.writer({
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
              dataSize: authorizeData.length
            })
          )
          .subbuffer(authorizeData)
          .finish()
      )
    }

    if (contactResult?.action === 'CREATE_NEW') {
      const MrimAddContactData = new MessageConstructor()
        .field('unknown', FieldDataType.UINT32)
        .field('unknown2', FieldDataType.UINT32)
        .field('addresser', FieldDataType.UBIART_LIKE_STRING)
        .field('nickname', FieldDataType.UBIART_LIKE_STRING)
        .field('unknown3', FieldDataType.UINT32)
        .field('message', FieldDataType.UNICODE_STRING)
        .finish()

      const packedMessage = MrimAddContactData.reader(packetData, state.utf16capable)

      if (client) {
        const messageData = MrimServerMessageData.writer({
          id: Math.floor(Math.random() * 0xffffffff),
          flags: 0x08 + 0x04, // MESSAGE_FLAGS_AUTHORIZE + MESSAGE_FLAGS_NORECV
          addresser: state.username + '@mail.ru',
          message: packedMessage.message,
          messageRTF: ''
        }, client.utf16capable)

        logger.debug(`[${connectionId}] ${state.username + '@mail.ru'} добавляется к ${request.contact.split('@')[0] + '@mail.ru'}`)

        client.socket.write(
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: Math.floor(Math.random() * 0xffffffff),
                packetCommand: MrimMessageCommands.MESSAGE_ACK,
                dataSize: messageData.length
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
            dataSize: authorizeToAddresser.length
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
              dataSize: authorizeReply.length
            })
          )
          .subbuffer(authorizeReply)
          .finish(),
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetCommand: MrimMessageCommands.CHANGE_STATUS,
              dataSize: statusReply.length
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
  const request = MrimModifyContactRequest.reader(packetData, state.utf16capable)

  if ((request.contact.length === 0 && state.lastAuthorizedContact === undefined) || (config.adminProfile?.enabled && request.contact.split('@')[0] === config.adminProfile?.username)) {
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
  let status;

  if (containerHeader.protocolVersionMinor >= 15) {
    status = MrimChangeXStatusRequest.reader(packetData, state.utf16capable)
  } else {
    status = MrimChangeStatusRequest.reader(packetData)
  }

  // пользователь хотит побыть невидимым
  if (status.status === 0x80000001) {
    status.status = 0 // STATUS_OFFLINE
  }

  state.status = status.status;

  if (status.status == 0x4) {
    state.xstatus.type = status.xstatusType
    state.xstatus.title = status.xstatusTitle
    state.xstatus.description = status.xstatusDescription
  }

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

    let userStatusUpdate;

    if (client.protocolVersionMinor >= 15) {
      userStatusUpdate = MrimUserXStatusUpdate.writer({
        status: status.status,
        xstatusType: status.xstatusType ?? '',
        xstatusTitle: status.xstatusTitle ?? '',
        xstatusDescription: status.xstatusDescription ?? '',
        features: status.features ?? 0xFF02,
        userAgent: status.userAgent ?? '',
        contact: `${state.username}@mail.ru`
      }, client.utf16capable)
    } else {
      userStatusUpdate = MrimUserStatusUpdate.writer({
        status: status.status !== 0x4 ? status.status : 0x1,
        contact: `${state.username}@mail.ru`
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

    logger.debug(`[${connectionId}] Передаётся изменённый статус у ${state.username}@mail.ru для контакта ${contact.user_login}@mail.ru`)
  }
}

async function processGame(
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let pakcet = MrimGameData.reader(packetData)

  // так ну неплохо надо бы переправить данный пакет нужному получателю
  const addresserClient = global.clients.find(
    ({ username }) => username === pakcet.addresser_or_receiver.split('@')[0]
  )
  if (addresserClient !== undefined) {
    // basically we're just pushin same data to client
    const dataToSend = MrimGameData.writer({
      addresser_or_receiver: state.username + '@mail.ru',
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
        data: ""
      })
    }
  }
}

async function processFileTransfer(
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let packet = MrimFileTransfer.reader(packetData)

  // так ну неплохо надо бы переправить данный пакет нужному получателю
  const addresserClient = global.clients.find(
    ({ username }) => username === packet.to_or_from.split('@')[0]
  )
  if (addresserClient !== undefined) {
    // иииииииии мы тупо шлём тоже самое блять)
    const dataToSend = MrimFileTransfer.writer({
      to_or_from: state.username + '@mail.ru',
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
        data: ""
      })
    }
  }
}

async function processFileTransferAnswer(
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let packet = MrimFileTransferAnswer.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username }) => username === packet.to_or_from.split('@')[0]
  )
  if (addresserClient !== undefined || packet.status !== 4) {
    const dataToSend = MrimFileTransferAnswer.writer({
      status: packet.status,
      to_or_from: state.username + '@mail.ru',
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
        data: ""
      })
    }
  }
}

async function processCall(
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let packet = MrimCall.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username }) => username === packet.to_or_from.split('@')[0]
  )
  if (addresserClient !== undefined || packet.status !== 4) {
    const dataToSend = MrimCall.writer({
      to_or_from: state.username + '@mail.ru',
      unique_id: packet.unique_id,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x228,
            packetCommand: MrimMessageCommands.CALL,
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
          status: 0, // Unknown error
      })
    }
  }
}

async function processCallAnswer(
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  let packet = MrimCall.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username }) => username === packet.to_or_from.split('@')[0]
  )
  if (addresserClient !== undefined) {
    const dataToSend = MrimCall.writer({
      status: packet.status,
      to_or_from: state.username + '@mail.ru',
      unique_id: packet.unique_id,
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
        unique_id: packet.unique_id,
      })
    }
  }
}

module.exports = {
  processHello,
  processLogin,
  processLoginThree,
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
  processCallAnswer
}
