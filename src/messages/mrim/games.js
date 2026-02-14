/**
 * @file Игры.
 * @author Vladimir Barinov <tailsxsu@autism.net.ru>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimGameData = new MessageConstructor()
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('session', FieldDataType.UINT32)
  .field('internal_msg', FieldDataType.UINT32)
  .field('message_id', FieldDataType.UINT32)
  .field('data', FieldDataType.SUBBUFFER)
  .finish()

const MrimGameNewerData = new MessageConstructor()
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('session', FieldDataType.UINT32)
  .field('internal_msg', FieldDataType.UINT32)
  .field('message_id', FieldDataType.UINT32)
  .field('time_send', FieldDataType.UINT32)
  .field('data', FieldDataType.SUBBUFFER)
  .finish()

module.exports = { MrimGameData, MrimGameNewerData }
