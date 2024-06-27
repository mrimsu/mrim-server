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

const MrimChangeStatusRequest = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .finish()

module.exports = { MrimUserStatusUpdate, MrimChangeStatusRequest }
