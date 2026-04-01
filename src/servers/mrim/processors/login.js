/**
 * @file Обработка входа в аккаунт
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../../constructors/binary')
const {
  MrimMessageCommands,
  MrimStatus
} = require('../globals')
const {
  MrimOldLoginData,
  MrimLoginData,
  MrimNewerLoginData,
  MrimMoreNewerLoginData,
  MrimLoginThreeData,
  MrimRejectLoginData
} = require('../../../messages/mrim/authorization')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const {
  MrimChangeStatusRequest,
  MrimChangeXStatusRequest
} = require('../../../messages/mrim/status')
const {
  getUserIdViaCredentials,
  searchUsers
} = require('../../../database')
const { _checkForFilledEmail, _logoutPreviousClientIfNeeded, _makeUserInfoPacket, _processOfflineMessages } = require('./core')
const { generateContactList } = require('./contacts')
const { processChangeStatus } = require('./status')
const { Iconv } = require('iconv')

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

  const userInfo = await _makeUserInfoPacket(containerHeader, logger, connectionId, state, searchResults[0])
  _checkForFilledEmail(containerHeader, logger, connectionId, state, searchResults[0].real_email)
  _processOfflineMessages(state.userId, containerHeader, logger, connectionId, state)

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0
      }),
      userInfo,
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
  } else if (containerHeader.protocolVersionMinor >= 14) {
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
    state.oldUserAgent = loginData.userAgent
    state.features = loginData.features

    if (containerHeader.protocolVersionMinor >= 15) {
      state.xstatus = {
        type: loginData.xstatusType,
        title: loginData.xstatusTitle,
        description: loginData.xstatusDescription
      }

      logger.debug(`[${connectionId}] xstatus: ${loginData.xstatusTitle} (${loginData.xstatusDescription})`)
    }

    if (loginData.modernUserAgent !== undefined) {
      // check if modern useragent is there and valid
      const agentRegex = RegExp('client="([A-Za-z0-9 ]+)"').exec(loginData.modernUserAgent)

      if (agentRegex && agentRegex.length > 1) {
        state.clientName = agentRegex[1]
      } else {

      }
    } else {
      // welp, let's guess

      // MRA 4.x
      const clientVer = RegExp(/MRA ([0-9\.]+) \(build ([0-9]+)\)/).exec(loginData.userAgent)

      if(clientVer && clientVer.length > 1)
      {
        state.userAgent = `client="magent" version="${clientVer[1]}" build="${clientVer[2]}"`
      }

      // J2ME Agent
      if(loginData.userAgent.startsWith("Версия 1.")) {
        const clientJ2ME = RegExp(/Версия 1.([0-9\.]+)/).exec(loginData.userAgent)

        if (clientJ2ME && clientJ2ME.length > 1) {
          state.userAgent = `client="jagent" version="1.${clientJ2ME[1]}"`
        }
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

    logger.info(`[${connectionId}] user ${loginData.login} logged in and they're online`)

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

  const userInfo = await _makeUserInfoPacket(containerHeader, logger, connectionId, state, searchResults[0])
  _checkForFilledEmail(containerHeader, logger, connectionId, state, searchResults[0].real_email)
  _processOfflineMessages(state.userId, containerHeader, logger, connectionId, state)

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0
      }),
      userInfo,
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

    logger.info(`[${connectionId}] user ${loginData.login} logged in and they're online`)

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

  // TODO: move replies to separate function

  // eslint-disable-next-line no-unused-vars
  const [contactList] = await Promise.all([
    generateContactList(containerHeader, state.userId)
  ])

  const searchResults = await searchUsers(0, { login: state.username })

  const userInfo = await _makeUserInfoPacket(containerHeader, logger, connectionId, state, searchResults[0])
  _checkForFilledEmail(containerHeader, logger, connectionId, state, searchResults[0].real_email)
  _processOfflineMessages(state.userId, containerHeader, logger, connectionId, state)

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0
      }),
      userInfo,
      contactList
    ]
  }
}

module.exports = { processLegacyLogin, processLogin, processLoginThree }
