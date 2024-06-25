/**
 * @file Сообщения поиска в MRIM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType,
} = require("../../constructors/message");

const MRIM_ANKETA_INFO_STATUS_OK = 1;

const MrimSearchField = new MessageConstructor()
  .field("key", FieldDataType.UINT32)
  .field("value", FieldDataType.UBIART_LIKE_STRING)
  .finish();

const MrimAnketaHeader = new MessageConstructor()
  .field("status", FieldDataType.UINT32, MRIM_ANKETA_INFO_STATUS_OK)
  .field("fieldCount", FieldDataType.UINT32)
  .field("maxRows", FieldDataType.UINT32)
  .field("serverTime", FieldDataType.UINT32)
  .finish();

module.exports = { MrimSearchField, MrimAnketaHeader };
