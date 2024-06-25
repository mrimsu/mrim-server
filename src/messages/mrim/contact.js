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
const MRIM_SERVER_FLAGS_DEFAULT = 0
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
  .field('serverFlags', FieldDataType.UINT32, MRIM_SERVER_FLAGS_DEFAULT)
  .field('status', FieldDataType.UINT32)
  .field('extendedStatusName', FieldDataType.UBIART_LIKE_STRING)
  .field('extendedStatusTitle', FieldDataType.UBIART_LIKE_STRING)
  .field('extendedStatusText', FieldDataType.UBIART_LIKE_STRING)
  .field('unknown1', FieldDataType.UINT32, MRIM_UNKNOWN1_VALUE_DEFAULT)
  .field('unknown2', FieldDataType.UINT32, MRIM_UNKNOWN2_VALUE_DEFAULT)
  .field('clientInfo', FieldDataType.UBIART_LIKE_STRING)
  .finish()

module.exports = { MrimContactList, MrimContactGroup, MrimContact }
