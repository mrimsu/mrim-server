/**
 * @file Сообщения авторизации MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimLoginData = new MessageConstructor()
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('password', FieldDataType.UBIART_LIKE_STRING)
  .field('status', FieldDataType.UINT32)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimUserInfo = new MessageConstructor()
  .field('nickname.field', FieldDataType.UBIART_LIKE_STRING, "MRIM.NICKNAME")
  .field('nickname', FieldDataType.UBIART_LIKE_STRING)
  .field('messagestotal.field', FieldDataType.UBIART_LIKE_STRING, "MESSAGES.TOTAL")
  .field('messagestotal', FieldDataType.UBIART_LIKE_STRING)
  .field('messagesunread.field', FieldDataType.UBIART_LIKE_STRING, "MESSAGES.UNREAD")
  .field('messagesunread', FieldDataType.UBIART_LIKE_STRING)
  .field('clientip.field', FieldDataType.UBIART_LIKE_STRING, "client.endpoint")
  .field('clientip', FieldDataType.UBIART_LIKE_STRING)
  .finish()

module.exports = { MrimLoginData, MrimUserInfo }
