/**
 * @file Контейнер микроблога MIRM.
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimChangeMicroblogStatus = new MessageConstructor()
  .field('flags', FieldDataType.UINT32)
  .field('text', FieldDataType.UNICODE_STRING, null, null, 500)
  .finish()

const MrimMicroblogStatus = new MessageConstructor()
  .field('flags', FieldDataType.UINT32)
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('id', FieldDataType.UINT64)
  .field('time', FieldDataType.UINT32)
  .field('text', FieldDataType.UNICODE_STRING, null, null, 500)
  .field('replyTo', FieldDataType.UINT32, 0)
  .finish()

module.exports = {
  MrimChangeMicroblogStatus,
  MrimMicroblogStatus
}
