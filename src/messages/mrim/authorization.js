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

module.exports = { MrimLoginData }
