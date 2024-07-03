/**
 * @file Контейнер контактов MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MRIM_GET_CONTACTS_OK = 0
const MRIM_CONTACT_GROUP_MAGIC = 8
const MRIM_UNKNOWN1_VALUE_DEFAULT = 0
const MRIM_UNKNOWN2_VALUE_DEFAULT = 0x03ff

const MrimContactList = new MessageConstructor()
  .field('status', FieldDataType.UINT32, MRIM_GET_CONTACTS_OK)
  .field('groupCount', FieldDataType.UINT32)
  .field('groupFlag', FieldDataType.UBIART_LIKE_STRING)
  .field('contactFlag', FieldDataType.UBIART_LIKE_STRING)
  .field('groups', FieldDataType.SUBBUFFER)
  .field('contacts', FieldDataType.SUBBUFFER)
  .finish()

const MrimContactGroup = new MessageConstructor()
  .field('magicHeader', FieldDataType.UINT32, MRIM_CONTACT_GROUP_MAGIC)
  .field('name', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimContact = new MessageConstructor()
  .field('magicHeader', FieldDataType.UINT32, MRIM_CONTACT_GROUP_MAGIC)
  .field('groupIndex', FieldDataType.UINT32)
  .field('email', FieldDataType.UBIART_LIKE_STRING)
  .field('login', FieldDataType.UBIART_LIKE_STRING)
  .field('authorized', FieldDataType.UINT32)
  .field('status', FieldDataType.UINT32)
  .field('extendedStatusName', FieldDataType.UBIART_LIKE_STRING)
  .field('extendedStatusTitle', FieldDataType.UBIART_LIKE_STRING)
  .field('extendedStatusText', FieldDataType.UBIART_LIKE_STRING)
  .field('unknown1', FieldDataType.UINT32, MRIM_UNKNOWN1_VALUE_DEFAULT)
  .field('unknown2', FieldDataType.UINT32, MRIM_UNKNOWN2_VALUE_DEFAULT)
  .field('clientInfo', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimAddContactRequest = new MessageConstructor()
  .field('flags', FieldDataType.UINT32)
  .field('groupIndex', FieldDataType.UINT32)
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('nickname', FieldDataType.UBIART_LIKE_STRING)
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
  .field('nickname', FieldDataType.UBIART_LIKE_STRING)
  .field('unknown1', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimModifyContactResponse = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .finish()

module.exports = {
  MrimContactList,
  MrimContactGroup,
  MrimContact,
  MrimAddContactRequest,
  MrimAddContactResponse,
  MrimContactAuthorizeData,
  MrimModifyContactRequest,
  MrimModifyContactResponse
}
