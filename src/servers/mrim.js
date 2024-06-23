/**
 * @file Реализация сервера с протоколом MRIM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const TCPServer = require('./tcp')

const { BinaryReader } = require('@glagan/binary-reader')
const { BinaryConstructor } = require('../binary')

const MrimMessageCommands = { HELLO: 0x1001, HELLO_ACK: 0x1002 }

const MRIM_MAGIC_HEADER = 0xefbeadde

// TODO mikhail начать реализовывать протокол MRIM
class MRIMServer extends TCPServer {
  onConnection (socket) {
    const { address, port } = socket.address()
    this.logger.info(`Клиент ${address}:${port} подключился к MRIM серверу`)

    const onData = this.onData(socket)
    const onError = this.onError.bind(this)

    socket.on('data', onData)
    socket.on('error', onError)
  }

  onData (socket) {
    const { address, port } = socket.address()

    const implementation = (data) => {
      this.logger.info(
        `Клиент ${address}:${port} отправил ${data.toString('hex')}`
      )

      const header = this.parseHeader(data, socket)

      if (header === null) {
        return socket.end()
      }

      this.logger.debug('===============================================')
      this.logger.debug(
        `Версия протокола: ${header.protocolVersion.minor}.${header.protocolVersion.major}`
      )
      this.logger.debug(`Последовательность пакета: ${header.packet.order}`)
      this.logger.debug(`Команда пакета: ${header.packet.command}`)
      this.logger.debug(`Размер пакета: ${header.packet.size}`)
      this.logger.debug('===============================================')

      const reply = this.processMessage(header, socket)

      socket.write(reply)
    }

    return implementation
  }

  onError (error) {
    this.logger.error(error.stack)
  }

  parseHeader (data, socket) {
    const binaryMessage = new BinaryReader(data)

    const magicNumber = binaryMessage.readUint32()
    if (magicNumber !== MRIM_MAGIC_HEADER) {
      this.logger.error(
        `Клиент отправил неверный "magic header" -> магия = ${magicNumber}`
      )
      return null
    }

    const parsedMessage = {
      protocolVersion: {
        major: binaryMessage.readUint16(),
        minor: binaryMessage.readUint16()
      },
      packet: {
        order: binaryMessage.readUint32(),
        command: binaryMessage.readUint32(),
        size: binaryMessage.readUint32(),
        senderAddress: binaryMessage.readUint32(),
        senderPort: binaryMessage.readInt32()
      },
      reversed: binaryMessage.readUint8Array(16)
    }

    return parsedMessage
  }

  processMessage (header, socket) {
    switch (header.packet.command) {
      case MrimMessageCommands.HELLO: {
        this.logger.debug('От клиента пакет определён как MRIM_CS_HELLO')
        this.logger.debug('Отправляем MRIM_CS_HELLO_ACK...')

        const data = new BinaryConstructor().integer(1000, 4).finish()

        return this.sendPacket(
          header,
          MrimMessageCommands.HELLO_ACK,
          data,
          0,
          socket
        )
      }
    }
  }

  // TODO mikhail сделать версию константным значением (MRIM_SERVER_VERSION_MINOR, MRIM_SERVER_VERSION_MAJOR)
  createHeader (requestHeader, command, data, order) {
    return new BinaryConstructor()
      .integer(MRIM_MAGIC_HEADER, 4)
      .integer(requestHeader.version.minor, 2)
      .integer(requestHeader.version.major, 2)
      .integer(order, 4)
      .integer(command, 4)
      .integer(data.length, 4)
      .integer(0, 4) // адрес отправителя
      .integer(0, 4) // порт отправителя
      .subbuffer(Buffer.alloc(16).fill(0)) // зарезервировано
      .finish()
  }

  sendPacket (requestHeader, command, data, order, socket) {
    const header = this.createHeader(requestHeader, command, data, order)
    socket.write(Buffer.concat([header, data]))
  }
}

module.exports = MRIMServer
