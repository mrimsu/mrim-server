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
  .field('message', FieldDataType.UBIART_LIKE_STRING)
  .field('messageRTF', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimServerMessageData = new MessageConstructor()
  .field('id', FieldDataType.UINT32)
  .field('flags', FieldDataType.UINT32)
  .field('addresser', FieldDataType.UBIART_LIKE_STRING)
  .field('message', FieldDataType.UBIART_LIKE_STRING)
  .field('messageRTF', FieldDataType.UBIART_LIKE_STRING)
  .finish()

module.exports = { MrimClientMessageData, MrimServerMessageData }
