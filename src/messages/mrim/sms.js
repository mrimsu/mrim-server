/**
 * @file SMS-сообщения MRIM.
 * @author neru asano <neru.asano9667@gmail.com>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimCsSms = new MessageConstructor()
  .field('flags', FieldDataType.UINT32)
  .field('phone', FieldDataType.UBIART_LIKE_STRING)
  .field('message', FieldDataType.UNICODE_STRING)
  .finish()

const MrimCsSmsAck = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .finish()

const MrimSmsStatus = {
  OK: 1,
  SERVICE_UNAVAILABLE: 2,
  INVALID_PARAMS: 0x10000
}

module.exports = { MrimCsSms, MrimCsSmsAck, MrimSmsStatus }