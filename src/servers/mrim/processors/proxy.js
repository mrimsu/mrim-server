/**
 * @file Реализация протокольного прокси
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { MrimMessageCommands, MrimConnectionStatus } = require('../globals')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const { MrimProxyRequest, MrimProxyAck, MrimProxyHelloStranger } = require('../../../messages/mrim/proxy')
const config = require('../../../../config')
const { Throttle } = require('stream-throttle')
const { _checkIfLoggedIn, _addNewProxyConnection } = require('./core')

async function processProxy (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const packet = MrimProxyRequest.reader(packetData, true)

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.contact.split('@')[0] &&
                              domain === packet.contact.split('@')[1]
  )

  let proxyAck

  if (config.mrim.enableProxy ?? true) {
    const sessionIdHigh = Math.abs(Math.floor(Math.random() * 0xFFFFFFFF));
    const sessionIdLow = Math.abs(Math.floor(Math.random() * 0xFFFFFFFF));
    const sessionIdHighSecondary = Math.abs(Math.floor(Math.random() * 0xFFFFFFFF));
    const sessionIdLowSecondary = Math.abs(Math.floor(Math.random() * 0xFFFFFFFF));

    _addNewProxyConnection(sessionIdHigh, sessionIdLow, sessionIdHighSecondary, sessionIdLowSecondary)

    proxyAck = MrimProxyAck.writer({
      status: MrimConnectionStatus.ACCEPT,
      contact: packet.contact,
      id: packet.id,
      proxy_type: packet.proxy_type,
      files: packet.files,
      files_unicode: packet.files_unicode,
      proxy_ip: (config.redirector?.redirectTo ?? LOCAL_IP_ADDRESS) + ';',
      session_id_high: sessionIdHigh,
      session_id_low: sessionIdLow,
      session_id_high_second: sessionIdHighSecondary,
      session_id_low_second: sessionIdLowSecondary,
    }, state.utf16capable)

    const proxyAckToContact = MrimProxyRequest.writer({
      contact: `${state.username}@${state.domain}`,
      id: packet.id,
      proxy_type: packet.proxy_type,
      files: packet.files,
      files_unicode: packet.files_unicode,
      proxy_ip: (config.redirector?.redirectTo ?? LOCAL_IP_ADDRESS) + ';',
      session_id_high: sessionIdHigh,
      session_id_low: sessionIdLow,
      session_id_high_second: sessionIdHighSecondary,
      session_id_low_second: sessionIdLowSecondary,
    }, state.utf16capable)

    const proxyPacket = new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.PROXY,
            dataSize: proxyAckToContact.length
          })
        )
        .subbuffer(proxyAckToContact)
        .finish()

    addresserClient.socket.write(proxyPacket);
  } else {
    proxyAck = MrimProxyAck.writer({
      status: MrimConnectionStatus.DENY,
      contact: packet.contact,
      id: packet.id,
      proxy_type: packet.proxy_type,
      files: packet.files,
      files_unicode: packet.files_unicode,
      proxy_ip: '',
      session_id_high: 0,
      session_id_low: 0,
    }, state.utf16capable)
  }

  return {
    reply: new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          packetCommand: MrimMessageCommands.PROXY_ACK,
          dataSize: proxyAck.length
        })
      )
      .subbuffer(proxyAck)
      .finish()
  }
}

async function processProxyHello (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  const packet = MrimProxyHelloStranger.reader(packetData, true)

  if (config.mrim.enableProxy ?? true) {
    logger.debug(`[${connectionId}] [proxy] hello :3`)

    const proxyIndex = global.proxies.findIndex(
      (proxy) => proxy.sessionIdHigh == packet.session_id_high && proxy.sessionIdLow == packet.session_id_low
              && proxy.sessHighSec == packet.session_id_high_second && proxy.sessLowSec == packet.session_id_low_second
    )

    state.proxyId = global.proxies[proxyIndex]
    state.isProxyConnection = true
    state.isSecondClientConnected = false
    state.protocolVersionMajor = containerHeader.protocolVersionMajor
    state.protocolVersionMinor = containerHeader.protocolVersionMinor
    state.connectionId = connectionId

    global.clients.push(state)

    global.proxiesTimeout[connectionId] = setTimeout((connectionId, state, logger) => {
      if (state.isSecondClientConnected === false) {
        logger.debug(`[${connectionId}] [proxy] user timed out (20 seconds passed without second client connecting)`)
        state.socket.destroySoon()

        const clientIndex = global.clients.findIndex(
          ({ connectionId }) => connectionId === state.connectionId
        )

        if (clientIndex >= 0) {
          global.clients.splice(clientIndex, 1)
        }

        if (proxyIndex >= 0) {
          global.proxies.splice(proxyIndex, 1)
        }
      }
    }, 20000, connectionId, state, logger)

    // search for second client
    const clientSecond = global.clients.filter(
      (client) => client.proxyId == global.proxies[proxyIndex] && client.connectionId != connectionId
    )

    if (clientSecond.length == 1) {
      logger.debug(`[${connectionId}] [proxy] they are waiting for you gordon. in the test chambrrr`)

      state.isSecondClientConnected = true
      clientSecond[0].isSecondClientConnected = true

      state.socket.write(
        new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetCommand: MrimMessageCommands.PROXY_HELLO_ACK,
                dataSize: 0
              })
            )
            .finish())

      clientSecond[0].socket.write(
        new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetCommand: MrimMessageCommands.PROXY_HELLO_ACK,
                dataSize: 0
              })
            )
            .finish())

      state.socket.removeAllListeners('data');
      clientSecond[0].socket.removeAllListeners('data');

      const speedLimit = config.mrim.proxySpeedLimit ?? 1024 * 1024;

      state.socket.pipe(new Throttle({ rate: speedLimit })).pipe(clientSecond[0].socket)
      clientSecond[0].socket.pipe(new Throttle({ rate: speedLimit })).pipe(state.socket)

      global.proxies.splice(proxyIndex, 1)
    }
  }
}

module.exports = { processProxy, processProxyHello }
