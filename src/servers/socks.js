/**
 * @file Реализация SOCKS5 прокси-сервера для подключения к MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const TCPServer = require('./tcp')
const { BinaryReader, BinaryEndianness } = require('@glagan/binary-reader')

const util = require('node:util')

const SocksAddressType = { IPV4: 0x01, DOMAIN: 0x03 }
const SocksAuthenticationMethods = { ANONYMOUS: 0x00, NOT_ACCEPTABLE: 0xff }
const SocksConnectionStatus = {
  SUCCESS: 0x00,
  CONNECTION_NOT_ALLOWED: 0x02,
  COMMAND_NOT_SUPPORTED: 0x07
}

const SOCKS_VERSION = 0x05
const SOCKS_COMMAND_CONNECT = 0x01

const IPV4_ADDRESS_FORMAT = '%d.%d.%d.%d'

const MIRM_UNSECURE_CONNECTION_PORT = 2402

class SocksServer extends TCPServer {
  constructor (options) {
    super({ host: options.host, port: options.port })

    if (options.mirm === undefined) {
      throw new Error('MIRM сервер необходим для SOCKS5 проски-сервера')
    }

    this.mirm = options.mirm
  }

  onConnection (socket) {
    const handleConnectionRequest = this.handleConnectionRequest(socket)
    const handleHandshakeRequest = this.handleHandshakeRequest(socket, handleConnectionRequest)

    socket.on('data', handleHandshakeRequest)
  }

  handleHandshakeRequest (socket, handleConnectionRequest) {
    const implementation = (request) => {
      const message = new BinaryReader(request, BinaryEndianness.NETWORK)

      const clientVersion = message.readUint8()
      if (clientVersion !== SOCKS_VERSION) {
        return socket.end()
      }

      const authenticationMethodCount = message.readUint8()
      const authenticationMethods = message.readUint8Array(
        authenticationMethodCount
      )

      const clientSupportsAnonymousAccess =
        authenticationMethods.includes(SocksAuthenticationMethods.ANONYMOUS)

      if (clientSupportsAnonymousAccess) {
        const reply = Buffer.from(
          [SOCKS_VERSION, SocksAuthenticationMethods.ANONYMOUS]
        )

        socket.removeListener('data', implementation)
        socket.on('data', handleConnectionRequest)

        return socket.write(reply)
      }

      const reply = Buffer.from(
        [SOCKS_VERSION, SocksAuthenticationMethods.NOT_ACCEPTABLE]
      )

      return socket.end(reply)
    }

    return implementation
  }

  // FIXME mikhail убрать "временный" костыль для подключения к MIRM
  handleConnectionRequest (socket) {
    const implementation = (request) => {
      const message = new BinaryReader(request, BinaryEndianness.NETWORK)

      const clientVersion = message.readUint8()
      if (clientVersion !== SOCKS_VERSION) {
        return socket.end()
      }

      const command = message.readUint8()
      if (command !== SOCKS_COMMAND_CONNECT) {
        const reply = this.createConnectionReply(request, SocksConnectionStatus.COMMAND_NOT_SUPPORTED)
        return socket.end(Buffer.from(reply))
      }

      message.offset++ // reversed byte

      const address = this.parseAddress(message) // eslint-disable-line no-unused-vars
      const port = message.readUint16()

      if (port !== MIRM_UNSECURE_CONNECTION_PORT) {
        const reply = this.createConnectionReply(request, SocksConnectionStatus.CONNECTION_NOT_ALLOWED)
        return socket.end(reply)
      }

      const reply = this.createConnectionReply(request, SocksConnectionStatus.SUCCESS)
      socket.write(reply)

      socket.removeAllListeners('data')
      this.mirm.onConnection(socket)
    }

    return implementation
  }

  parseAddress (message) {
    const addressType = message.readUint8()

    switch (addressType) {
      case SocksAddressType.IPV4:
        return this.parseIPv4Address(message)

      case SocksAddressType.DOMAIN:
        return this.parseDomainAddress(message)

      default:
        return null
    }
  }

  parseIPv4Address (message) {
    return util.format(
      IPV4_ADDRESS_FORMAT,
      message.readUint8(),
      message.readUint8(),
      message.readUint8(),
      message.readUint8()
    )
  }

  parseDomainAddress (message) {
    const domainAddressLength = message.readUint8()
    return message.readArrayAsString(domainAddressLength)
  }

  createConnectionReply (request, status) {
    const reply = new Uint8Array(request)
    reply[1] = status

    return Buffer.from(reply)
  }
}

module.exports = SocksServer
