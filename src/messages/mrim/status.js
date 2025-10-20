/**
 * @file Сообщения статуса в MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimUserStatusUpdate = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimUserXStatusUpdate = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .field('xstatusType', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusTitle', FieldDataType.UNICODE_STRING)
  .field('xstatusDescription', FieldDataType.UNICODE_STRING)
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('features', FieldDataType.UINT32)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimChangeStatusRequest = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .finish()

const MrimChangeXStatusRequest = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .field('xstatusType', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusTitle', FieldDataType.UNICODE_STRING)
  .field('xstatusDescription', FieldDataType.UNICODE_STRING)
  .field('features', FieldDataType.UINT32)
  .finish()

module.exports = { MrimUserStatusUpdate, MrimUserXStatusUpdate, MrimChangeStatusRequest, MrimChangeXStatusRequest }
