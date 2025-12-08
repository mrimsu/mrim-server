/**
 * @file Сообщения авторизации MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

// для MRIM 1.14 и ниже
const MrimLoginData = new MessageConstructor()
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('password', FieldDataType.UBIART_LIKE_STRING)
  .field('status', FieldDataType.UINT32)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .finish()

// для MRIM 1.15 и выше
const MrimNewerLoginData = new MessageConstructor()
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('password', FieldDataType.UBIART_LIKE_STRING)
  .field('status', FieldDataType.UINT32)
  .field('xstatusType', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusTitle', FieldDataType.UNICODE_STRING)
  .field('xstatusDescription', FieldDataType.UNICODE_STRING)
  .field('features', FieldDataType.UINT32)
  .field('modernUserAgent', FieldDataType.UBIART_LIKE_STRING)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .finish()

// для MRIM 1.16 и выше
const MrimMoreNewerLoginData = new MessageConstructor()
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('password', FieldDataType.UBIART_LIKE_STRING)
  .field('status', FieldDataType.UINT32)
  .field('xstatusType', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusTitle', FieldDataType.UNICODE_STRING)
  .field('xstatusDescription', FieldDataType.UNICODE_STRING)
  .field('features', FieldDataType.UINT32)
  .field('modernUserAgent', FieldDataType.UBIART_LIKE_STRING)
  .field('locale', FieldDataType.UBIART_LIKE_STRING)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimRejectLoginData = new MessageConstructor()
  .field('reason', FieldDataType.UBIART_LIKE_STRING)
  .finish()

// для MRIM 1.21 и выше
const MrimLoginThreeData = new MessageConstructor()
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('password', FieldDataType.UBIART_LIKE_STRING)
  .field('unknown0', FieldDataType.UINT32)
  .field('modernUserAgent', FieldDataType.UBIART_LIKE_STRING)
  .field('locale', FieldDataType.UBIART_LIKE_STRING)
  .field('unknown1', FieldDataType.UINT32)
  .field('unknown2', FieldDataType.UINT32)
  .field('geo-list', FieldDataType.UBIART_LIKE_STRING)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimUserInfo = new MessageConstructor()
  .field('nickname.field', FieldDataType.UBIART_LIKE_STRING, 'MRIM.NICKNAME')
  .field('nickname', FieldDataType.UNICODE_STRING)
  .field('messagestotal.field', FieldDataType.UBIART_LIKE_STRING, 'MESSAGES.TOTAL')
  .field('messagestotal', FieldDataType.UNICODE_STRING)
  .field('messagesunread.field', FieldDataType.UBIART_LIKE_STRING, 'MESSAGES.UNREAD')
  .field('messagesunread', FieldDataType.UNICODE_STRING)
  .field('clientip.field', FieldDataType.UBIART_LIKE_STRING, 'client.endpoint')
  .field('clientip', FieldDataType.UNICODE_STRING)
  /* .field('mblogid.field', FieldDataType.UBIART_LIKE_STRING, 'micblog.status.id')
  .field('mblogid', FieldDataType.UINT32)
  .field('mblogtime.field', FieldDataType.UBIART_LIKE_STRING, 'micblog.status.time')
  .field('mblogtime', FieldDataType.UINT32)
  .field('mblogtext.field', FieldDataType.UBIART_LIKE_STRING, 'micblog.status.text')
  .field('mblogtext', FieldDataType.UNICODE_STRING) */
  .finish()

module.exports = { MrimLoginData, MrimNewerLoginData, MrimMoreNewerLoginData, MrimLoginThreeData, MrimRejectLoginData, MrimUserInfo }
