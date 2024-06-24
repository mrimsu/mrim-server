/**
 * @file Реализация сервера с протоколом MRIM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const TCPServer = require('./tcp')

const { BinaryReader, BinaryEndianness } = require('@glagan/binary-reader')
const { BinaryConstructor } = require('../binary')

const MrimMessageCommands = { 
  // Authorization
  HELLO: 0x1001, HELLO_ACK: 0x1002, LOGIN_ACK: 0x1004, LOGIN_REJ: 0x1005, PING: 0x1006, LOGIN2: 0x1038,
  // Contacts
  CONTACT_LIST2: 0x1037, 

  // Messages
  MAILBOX_STATUS: 0x1033,
}

const MRIM_MAGIC_HEADER = 0xdeadbeef

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

      const packetData = new BinaryReader(data);
      packetData.offset = 44; // Header default size

      this.processMessage(header, packetData.readUint8Array(header.packet.size), socket)
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
        `Клиент отправил неверный "magic header" -> магия = ${magicNumber} | нужна ${MRIM_MAGIC_HEADER}`
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

  processMessage (header, data, socket) {
    switch (header.packet.command) {
      case MrimMessageCommands.HELLO: {
        this.logger.debug('От клиента пакет определён как MRIM_CS_HELLO')
        this.logger.debug('Отправляем MRIM_CS_HELLO_ACK...')
        
        const dataToSend = new BinaryConstructor().integer(10, 4).finish()
        
        this.sendPacket(
          header,
          MrimMessageCommands.HELLO_ACK,
          dataToSend,
          0,
          socket
        )
        break;
      }
      
      case MrimMessageCommands.LOGIN2: {
        this.logger.debug('От клиента пакет определён как MRIM_CS_LOGIN2')
        this.logger.debug('Временно отправляем MRIM_CS_LOGIN_ACK')
        
        this.parseLoginInfo(data);
        
        const dataToSend = new BinaryConstructor().finish()
        
        this.sendPacket(
          header,
          MrimMessageCommands.LOGIN_ACK,
          dataToSend,
          header.packet.order,
          socket
        )
        
        this.logger.debug('Через MRIM_CS_MAILBOX_STATUS наврём, что у нас 3 новых сообщения')
        
        const dataToSend2 = new BinaryConstructor().integer(3, 4).finish()
        
        this.sendPacket(
          header,
          MrimMessageCommands.MAILBOX_STATUS,
          dataToSend2,
          header.packet.order,
          socket
        )
        
        this.logger.debug('Через MRIM_CS_CONTACT_LIST2 наврём, что у нас 2 группы и 1 контакт')
        
        const dataToSend3 = Buffer.from("00000000020000000200000075730C000000757573737575737373737573080000000700000047656E6572616C08000000040000005465737408000000010000000F000000737570706F7274406D61696C2E727507000000536C757A686261000000000100000000000000000000000000000000000000FF03000027000000636C69656E743D4A324D454167656E742076657273696F6E3D312E33206275696C643D31393337", 'hex');
        
        this.sendPacket(
          header,
          MrimMessageCommands.CONTACT_LIST2,
          dataToSend3,
          header.packet.order,
          socket
        )
        break;
      }

      case MrimMessageCommands.PING: {
        this.logger.debug('От клиента прилетел пинг. Игнорируем')
        break;
      }
    }
  }
  
  // TODO mikhail сделать версию константным значением (MRIM_SERVER_VERSION_MINOR, MRIM_SERVER_VERSION_MAJOR)
  createHeader (requestHeader, command, data, order) {
    return new BinaryConstructor()
    .integer(MRIM_MAGIC_HEADER, 4)
    .integer(requestHeader.protocolVersion.minor, 2)
    .integer(requestHeader.protocolVersion.major, 2)
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
    
    // For processing packets
  parseLoginInfo(data) {
    if (data.length !== 0) {
      const packetData = new BinaryReader(data, BinaryEndianness.LITTLE);
      let loginsize = packetData.readUint32();
      let login = packetData.readUint8Array(loginsize).toString('utf-8');;
      let passwordsize = packetData.readUint32();
      let password = packetData.readUint8Array(passwordsize).toString('utf-8');;
      let status = packetData.readUint32();
      let useragentsize = packetData.readUint32();
      let useragent = packetData.readUint8Array(useragentsize).toString('utf-8');;
      
      this.logger.debug('!! Вход в аккаунт !!')
      this.logger.debug(`Логин: ${login}`);
      this.logger.debug(`Пароль: ${password}`);
      this.logger.debug(`Статус: ${status}`);
      this.logger.debug(`Юзерагент: ${useragent}`);


    }
  }
}

module.exports = MRIMServer
