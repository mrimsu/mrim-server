/**
 * @file Игры.
 * @author Vladimir Barinov <tailsxsu@autism.net.ru>
 */

const {
    MessageConstructor,
    FieldDataType
  } = require('../../constructors/message')
  
  const MrimGameData = new MessageConstructor()
    .field('addresser_or_receiver', FieldDataType.UBIART_LIKE_STRING)
    .field('session', FieldDataType.UINT32)
    .field('internal_msg', FieldDataType.UINT32)
    .field('message_id', FieldDataType.UINT32)
    .field('data', FieldDataType.UBIART_LIKE_STRING)
    .finish()

  module.exports = { MrimGameData }
  