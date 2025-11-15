/**
 * @file Работа с абстрацией электронного почтового ящика.
 * @author Vladimir Barinov <tailsxsu@autism.net.ru>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimNewEmail = new MessageConstructor()
  .field('email_count', FieldDataType.UINT32)
  .field('from', FieldDataType.UINT32)
  .field('title', FieldDataType.UNICODE_STRING)
  .field('unix_time', FieldDataType.UINT32)
  .field('reserved0', FieldDataType.SUBBUFFER, Buffer.alloc(16).fill(0))
  .finish()

module.exports = { MrimNewEmail }
