/**
 * @file Контейнер сообщений MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { BinaryEndianness } = require("@glagan/binary-reader");
const {
  MessageConstructor,
  FieldDataType,
} = require("../../constructors/message");

const MIRM_MAGIC_HEADER = 0xdeadbeef;

const MrimContainerHeader = new MessageConstructor()
  .field("magicHeader", FieldDataType.UINT32, MIRM_MAGIC_HEADER)
  .field("protocolVersionMinor", FieldDataType.UINT16)
  .field("protocolVersionMajor", FieldDataType.UINT16)
  .field("packetOrder", FieldDataType.UINT32)
  .field("packetCommand", FieldDataType.UINT32)
  .field("dataSize", FieldDataType.UINT32)
  .field("senderAddress", FieldDataType.UINT32)
  .field("senderPort", FieldDataType.UINT32)
  .field("reserved", FieldDataType.SUBBUFFER, Buffer.alloc(16).fill(0))
  .finish();

module.exports = { MrimContainerHeader };
