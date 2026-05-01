/**
 * @file Корневые функции
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { MrimMessageCommands, MrimMessageFlags } = require('../globals')
const { MrimUserInfo } = require('../../../messages/mrim/authorization')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const { MrimServerMessageData, MrimOfflineMessageData } = require('../../../messages/mrim/messaging')
const {
  getOfflineMessages,
  getLastMicroblog
} = require('../../../database')
const config = require('../../../../config')
const { Iconv } = require('iconv')

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
    const messageId = message.message_id
    const date = new Date(message.date * 1000)

    const msgHeader = '' +
    `From: ${message.user_login}@${message.user_domain}\r\n` +
    `Date: ${date.toUTCString()}\r\n` +
    'X-MRIM-Flags: 00100000\r\n' +
    'Content-Type: text/plain; charset=UTF-16LE\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n'

    const msg = msgHeader + new Iconv('UTF-8', 'UTF-16LE').convert(message.message).toString('base64')

    const messagePacket = MrimOfflineMessageData.writer({
      id: messageId,
      data: msg
    }, false)

    const packet = new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          protocolVersionMinor: state.protocolVersionMinor,
          packetOrder: messageId,
          packetCommand: MrimMessageCommands.OFFLINE_MESSAGE_ACK,
          dataSize: messagePacket.length
        })
      )
      .subbuffer(messagePacket)
      .finish()

    state.socket.write(packet)
  })

  logger.debug(`[${connectionId}] found ${offlineMessages.length} offline messages for userid = ${userId}`)
}

async function _makeUserInfoPacket (containerHeader, logger, connectionId, state, userInfo) {
  let clientip = state.socket.remoteAddress

  if (state.socket.remoteFamily === 'IPv6' && clientip.startsWith('::ffff:')) {
    clientip = clientip.slice(7)
  } else if (state.socket.remoteFamily !== 'IPv4') {
    clientip = '127.0.0.1'
  }

  const microblog = await getLastMicroblog(state.userId)

  if (microblog !== null && microblog.date > (Math.floor(Date.now() / 1000) - (60 * 60 * 24 * 7))) {
    state.microblog = {
      id: microblog.id,
      text: microblog.message,
      date: microblog.date
    }
  }

  const userInfoPacket = MrimUserInfo.writer({
    nickname: userInfo.nick,
    messagestotal: '0', // dummy
    messagesunread: '0', // dummy
    clientip: clientip + ':' + state.socket.remotePort,
    mblogid: `${state.microblog?.id ?? 0}`,
    mblogtime: `${state.microblog?.date ?? 0}`,
    mblogtext: state.microblog?.text ?? ''
  }, state.utf16capable)

  return new BinaryConstructor()
    .subbuffer(
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.USER_INFO,
        dataSize: userInfoPacket.length
      })
    )
    .subbuffer(userInfoPacket)
    .finish()
}

async function _checkForFilledEmail (containerHeader, logger, connectionId, state, email) {
  if (email === null && config.adminProfile?.enabled && config.mrim.realEmailRequired === true) {
    const emailMessage = MrimServerMessageData.writer({
      id: 0x4,
      flags: MrimMessageFlags.NORECV,
      addresser: `${config.adminProfile?.username}@${config.adminProfile?.domain}`,
      message: 'ВАЖНО! Для Вашего аккаунта НЕОБХОДИМО указать в настройках своей анкеты реальную электронную почту, ' +
               'иначе ваш аккаунт может быть удалён. Сделать это вы можете на сайте проекта: http://mrim.su/login' +
               '\n\nВаша настоящая электронная почта не будет видна другим пользователям и будет служить ' +
               'лишь для восстановления доступа к аккаунту.',
      messageRTF: ' '
    }, state.utf16capable)

    const messagePacket = new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          protocolVersionMinor: state.protocolVersionMinor,
          packetCommand: MrimMessageCommands.MESSAGE_ACK,
          dataSize: emailMessage.length
        })
      )
      .subbuffer(emailMessage)
      .finish()

    state.socket.write(messagePacket)
  }
}

async function _checkIfLoggedIn (containerHeader, logger, connectionId, state) {
  if (state.userId === null) {
    state.socket.end()
    logger.debug(`[${connectionId}] someone tried to use auth-only commands. kicking them out!`)
    return 0
  }
  return 1
}

async function _addNewProxyConnection (sessionIdHigh, sessionIdLow, sessHighSec, sessLowSec) {
  const proxy = { sessionIdHigh, sessionIdLow, sessHighSec, sessLowSec }

  global.proxies.push(proxy)
}

module.exports = { _logoutPreviousClientIfNeeded, _processOfflineMessages, _makeUserInfoPacket, _checkForFilledEmail, _checkIfLoggedIn, _addNewProxyConnection }
