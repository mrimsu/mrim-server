/**
 * @file Контейнер контактов MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MRIM_GET_CONTACTS_OK = 0

// MRIM 1.7 and older
const MrimLegacyContactList = new MessageConstructor()
  .field('contactsCount', FieldDataType.UINT32)
  .field('contactsLength', FieldDataType.UINT32)
  .field('contacts', FieldDataType.SUBBUFFER)
  .finish()

const MrimContactList = new MessageConstructor()
  .field('status', FieldDataType.UINT32, MRIM_GET_CONTACTS_OK)
  .field('groupCount', FieldDataType.UINT32)
  .field('groupFlag', FieldDataType.UBIART_LIKE_STRING)
  .field('contactFlag', FieldDataType.UBIART_LIKE_STRING)
  .field('groups', FieldDataType.SUBBUFFER)
  .field('contacts', FieldDataType.SUBBUFFER)
  .finish()

const MrimContactGroup = new MessageConstructor()
  .field('groupFlags', FieldDataType.UINT32)
  .field('name', FieldDataType.UNICODE_STRING)
  .finish()

// mask uussuu
const MrimOldContact = new MessageConstructor()
  .field('contactFlags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('email', FieldDataType.UBIART_LIKE_STRING)
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('authorized', FieldDataType.UINT32)
  .field('status', FieldDataType.UINT32)
  .finish()

// MRIM >1.8 (mask uussuus)
const MrimContact = new MessageConstructor()
  .field('contactFlags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('email', FieldDataType.UBIART_LIKE_STRING)
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('authorized', FieldDataType.UINT32)
  .field('status', FieldDataType.UINT32)
  .field('phoneNumber', FieldDataType.UBIART_LIKE_STRING)
  .finish()

// MRIM >1.14 (mask uussuussssus)
const MrimContactNewer = new MessageConstructor()
  .field('contactFlags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('email', FieldDataType.UBIART_LIKE_STRING)
  .field('login', FieldDataType.UNICODE_STRING)
  .field('authorized', FieldDataType.UINT32)
  .field('status', FieldDataType.UINT32)
  .field('phoneNumber', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusType', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusTitle', FieldDataType.UNICODE_STRING)
  .field('xstatusDescription', FieldDataType.UNICODE_STRING)
  .field('features', FieldDataType.UINT32)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .finish()

// MRIM >1.20
const MrimContactWithMicroblog = new MessageConstructor()
  .field('contactFlags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('email', FieldDataType.UBIART_LIKE_STRING)
  .field('login', FieldDataType.UNICODE_STRING)
  .field('authorized', FieldDataType.UINT32)
  .field('status', FieldDataType.UINT32)
  .field('phoneNumber', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusType', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusTitle', FieldDataType.UNICODE_STRING)
  .field('xstatusDescription', FieldDataType.UNICODE_STRING)
  .field('features', FieldDataType.UINT32)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .field('microblogId', FieldDataType.UINT64)
  .field('microblogUnixTime', FieldDataType.UINT32)
  .field('microblogLastMessage', FieldDataType.UNICODE_STRING)
  .field('reserved', FieldDataType.UNICODE_STRING)
  .field('replyTo', FieldDataType.UNICODE_STRING)
  .finish()

// MRIM >1.21
const MrimContactWithMicroblogNewer = new MessageConstructor()
  .field('contactFlags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('email', FieldDataType.UBIART_LIKE_STRING)
  .field('login', FieldDataType.UNICODE_STRING)
  .field('authorized', FieldDataType.UINT32)
  .field('status', FieldDataType.UINT32)
  .field('phoneNumber', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusType', FieldDataType.UBIART_LIKE_STRING)
  .field('xstatusTitle', FieldDataType.UNICODE_STRING)
  .field('xstatusDescription', FieldDataType.UNICODE_STRING)
  .field('features', FieldDataType.UINT32)
  .field('userAgent', FieldDataType.UBIART_LIKE_STRING)
  .field('microblogId', FieldDataType.UINT64)
  .field('microblogUnixTime', FieldDataType.UINT32)
  .field('microblogLastMessage', FieldDataType.UNICODE_STRING)
  .field('reserved', FieldDataType.UNICODE_STRING)
  .field('replyTo', FieldDataType.UNICODE_STRING)
  .field('unknown0', FieldDataType.UNICODE_STRING)
  .field('unknown1', FieldDataType.UNICODE_STRING)
  .field('unknown2', FieldDataType.UINT32)
  .finish()

const MrimAddContactRequest = new MessageConstructor()
  .field('flags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('nickname', FieldDataType.UNICODE_STRING)
  .field('reserved', FieldDataType.UINT32)
  .field('authMessage', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimAddContactResponse = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .field('contactId', FieldDataType.UINT32)
  .finish()

const MrimContactAuthorizeData = new MessageConstructor()
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimModifyContactRequest = new MessageConstructor()
  .field('id', FieldDataType.UINT32)
  .field('flags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('nickname', FieldDataType.UNICODE_STRING)
  .field('unknown1', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimModifyContactResponse = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .finish()

module.exports = {
  MrimLegacyContactList,

  MrimContactList,
  MrimContactGroup,

  MrimOldContact,
  MrimContact,
  MrimContactNewer,
  MrimContactWithMicroblog,
  MrimContactWithMicroblogNewer,
  MrimAddContactRequest,
  MrimAddContactResponse,
  MrimContactAuthorizeData,
  MrimModifyContactRequest,
  MrimModifyContactResponse
}
