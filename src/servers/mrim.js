/**
 * @file Реализация сервера с протоколом MRIM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const TCPServer = require('./tcp')
const { BinaryReader, BinaryEndianness } = require('@glagan/binary-reader')

// TODO mikhail начать реализовывать протокол MRIM
class MRIMServer extends TCPServer {
  onConnection (socket) {
    // socket.setEncoding('ascii')

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
      this.parsePacket(data, socket)
      this.logger.info(`Клиент ${address}:${port} отправил "${data}"`)
      socket.write(data)
    }

    return implementation
  }

  onError (error) {
    this.logger.error(error.stack)
  }

  parsePacket (data, socket) {
    const message = new BinaryReader(data, BinaryEndianness.LITTLE)
    let magic_number = message.readInt32();
    if (magic_number == -559038737) {       // 0xDEADBEEF
      this.logger.info(`!!! Мертвая скотина !!!`);
    }
    let proto_version_minor = message.readInt16();
    let proto_version_major = message.readInt16();
    let order = message.readInt32();
    let packet_type = message.readInt32(); // for example 0x1001 => MRIM_CS_HELLO
    let packet_size = message.readInt32();
    let packet_from = message.readInt32();
    let packet_fromport = message.readInt32();
    let packet_reserved = message.readInt8();
    this.logger.info(`Версия протокола: ${proto_version_major}.${proto_version_minor}`);
    this.logger.info(`Последовательность пакета: ${order}`);
    this.logger.info(`Тип пакета: ${packet_type}`);
    this.logger.info(`Размер пакета: ${packet_size}`);
    this.logger.info(`===============================================`);
    let header = {
      magic_number,
      proto_version_minor,
      proto_version_major,
      order,
      packet_type,
      packet_size,
      packet_from,
      packet_fromport,
      packet_reserved
    }
    
    // MRIM_CS_HELLO || C -> S
    if (packet_type === 4097) {
      this.logger.info(`От клиента пакет определён как MRIM_CS_HELLO`);
      this.logger.info(`Отправляем MRIM_CS_HELLO_ACK...`);
      this.processHello(socket);
    }
  }

  processHello(socket) {
    this.sendPacket(4098, this.int32toHex(1000), 0, socket);
  }

  makeHeader(type, data, order) {                 // i.g. type == 4097
    let header = this.hexToBinary("efbeadde");    // magic number
    header += this.hexToBinary("16000100");       // protocol version
    header += this.int32toHex(order);             // order
    header += this.int32toHex(type);              // packet type
    header += this.int32toHex(data.length);       // packet size
    header += this.hexToBinary("00000000");       // from (???)
    header += this.hexToBinary("00000000");       // port (???)
    const buffer = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
      buffer.writeUIntLE(0, i, 1);
    }                                             // reserved (???)
    header += buffer.toString();
    return header;
  }

  int32toHex(int32) {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(int32, 0);
    return buffer.toString();
  }

  hexToBinary(hex) {
    return parseInt(hex, 16).toString(2);
  }

  sendPacket(type, data, order, socket) {
    let buffer = this.makeHeader(type, data, order);
    buffer += data;
    socket.write(buffer);
  }
}

module.exports = MRIMServer
