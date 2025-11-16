/**
 * @file Передача файлов.
 * @author Vladimir Barinov <tailsxsu@autism.net.ru>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimFileTransfer = new MessageConstructor()
  .field('to_or_from', FieldDataType.UBIART_LIKE_STRING)
  .field('unique_id', FieldDataType.UINT32)
  .field('files_size', FieldDataType.UINT32)
  .field('data', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimFileTransferAnswer = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .field('to_or_from', FieldDataType.UBIART_LIKE_STRING)
  .field('unique_id', FieldDataType.UINT32)
  .field('data', FieldDataType.UBIART_LIKE_STRING)
  .finish()

module.exports = { MrimFileTransfer, MrimFileTransferAnswer }
