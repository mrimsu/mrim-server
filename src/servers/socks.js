/**
 * @file Реализация SOCKS5 прокси-сервера для подключения к MRIM.
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

const MRIM_UNSECURE_CONNECTION_PORT = 2402

const IPV4_ADDRESS_FORMAT = '%d.%d.%d.%d'

class SocksServer extends TCPServer {
  constructor (options) {
    super({ ...options, MRIM: undefined })

    if (options.MRIM === undefined) {
      throw new Error('MRIM сервер необходим для SOCKS5 проски-сервера')
    }

    this.MRIM = options.MRIM
  }

  onConnection (socket) {
    const handleConnectionRequest = this.handleConnectionRequest(socket)
    const handleHandshakeRequest = this.handleHandshakeRequest(socket, handleConnectionRequest)

    const { address, port } = socket.address()
    this.logger.info(`Клиент ${address}:${port} подключился к SOCKS5 прокси-серверу.`)

    socket.on('data', handleHandshakeRequest)
    socket.on('error', (error) => this.logger.error(error.stack))
  }

  handleHandshakeRequest (socket, handleConnectionRequest) {
    const implementation = (request) => {
      const { address, port } = socket.address()
      const message = new BinaryReader(request, BinaryEndianness.NETWORK)

      const clientVersion = message.readUint8()
      if (clientVersion !== SOCKS_VERSION) {
        this.logger.error(`Клиент ${address}:${port} использует не ту версию SOCKS -> версия клиента: ${clientVersion}`)
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

      this.logger.error(`Клиент ${address}:${port} не поддерживает анонимное подключение`)
      return socket.end(reply)
    }

    return implementation
  }

  // FIXME mikhail убрать "временный" костыль для подключения к MRIM
  handleConnectionRequest (socket) {
    const implementation = (request) => {
      const { address, port } = socket.address()
      const message = new BinaryReader(request, BinaryEndianness.NETWORK)

      const clientVersion = message.readUint8()
      if (clientVersion !== SOCKS_VERSION) {
        this.logger.error(`Клиент ${address}:${port} использует не ту версию SOCKS -> версия клиента: ${clientVersion}`)
        return socket.end()
      }

      const command = message.readUint8()
      if (command !== SOCKS_COMMAND_CONNECT) {
        const reply = this.createConnectionReply(request, SocksConnectionStatus.COMMAND_NOT_SUPPORTED)

        this.logger.error(`Клиент ${address}:${port} отправил не поддерживаемую команду -> код команды: ${command}`)
        return socket.end(Buffer.from(reply))
      }

      message.offset++ // зарезервированное место

      const destinationAddress = this.parseAddress(message)
      const destinationPort = message.readUint16()

      if (destinationPort !== MRIM_UNSECURE_CONNECTION_PORT) {
        const reply = this.createConnectionReply(request, SocksConnectionStatus.CONNECTION_NOT_ALLOWED)

        this.logger.error(`Клиент ${address}:${port} хочет подключиться не к MRIM -> адрес: ${destinationAddress}, порт: ${destinationPort}`)
        return socket.end(reply)
      }

      const reply = this.createConnectionReply(request, SocksConnectionStatus.SUCCESS)
      socket.write(reply)

      this.removeAllListeners(socket)
      this.logger.info(`Клиент ${address}:${port} переподключен к MRIM`)

      this.MRIM.onConnection(socket)
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

  removeAllListeners (socket) {
    socket.removeAllListeners('data')
    socket.removeAllListeners('error')
  }
}

module.exports = SocksServer
