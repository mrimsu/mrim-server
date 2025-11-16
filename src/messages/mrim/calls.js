/**
 * @file Звонки.
 * @author Vladimir Barinov <tailsxsu@autism.net.ru>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimCall = new MessageConstructor()
  .field('to_or_from', FieldDataType.UBIART_LIKE_STRING)
  .field('unique_id', FieldDataType.UINT32)
  .field('data', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimCallAnswer = new MessageConstructor()
  .field('to_or_from', FieldDataType.UBIART_LIKE_STRING)
  .field('unique_id', FieldDataType.UINT32)
  .field('status', FieldDataType.UINT32)
  .finish()

module.exports = { MrimCall, MrimCallAnswer }
