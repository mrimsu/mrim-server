/**
 * @file Сообщения приветствия клиента/сервера SOCKS5.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { BinaryEndianness } = require('../../binary-reader')
const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const SOCKS_VERSION = 0x05

const ClientHandshakeMessage = new MessageConstructor(BinaryEndianness.NETWORK)
  .field('protocolVersion', FieldDataType.BYTE, SOCKS_VERSION)
  .field('authenticationMethods', FieldDataType.BYTE_ARRAY)
  .finish()

const ServerHandshakeMessage = new MessageConstructor(BinaryEndianness.NETWORK)
  .field('protocolVersion', FieldDataType.BYTE, SOCKS_VERSION)
  .field('authenticationMethod', FieldDataType.BYTE)
  .finish()

module.exports = { ClientHandshakeMessage, ServerHandshakeMessage }
