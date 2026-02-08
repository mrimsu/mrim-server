/**
 * @file Сообщения диалогов MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimClientMessageData = new MessageConstructor()
  .field('flags', FieldDataType.UINT32)
  .field('addresser', FieldDataType.UBIART_LIKE_STRING)
  .field('message', FieldDataType.UNICODE_STRING)
  .field('messageRTF', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimServerMessageData = new MessageConstructor()
  .field('id', FieldDataType.UINT32)
  .field('flags', FieldDataType.UINT32)
  .field('addresser', FieldDataType.UBIART_LIKE_STRING)
  .field('message', FieldDataType.UNICODE_STRING)
  .field('messageRTF', FieldDataType.UBIART_LIKE_STRING)
  .field('reserved0', FieldDataType.UINT32, 0)
  .field('reserved1', FieldDataType.UINT32, 0)
  .field('reserved2', FieldDataType.UINT32, 0)
  .finish()

const MrimOfflineMessageData = new MessageConstructor()
  .field('id', FieldDataType.UINT64)
  .field('data', FieldDataType.UNICODE_STRING)
  .finish()
  
const MrimOfflineMessageDelete = new MessageConstructor()
  .field('id', FieldDataType.UINT64)
  .finish()

module.exports = { MrimClientMessageData, MrimServerMessageData, MrimOfflineMessageData, MrimOfflineMessageDelete }
