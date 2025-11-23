/**
 * @file Сообщения диалогов MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimClientMessageData = new MessageConstructor()
  .field('flags', FieldDataType.UINT32)
  .field('addresser', FieldDataType.UBIART_LIKE_STRING)
  .field('message', FieldDataType.UNICODE_STRING)
  .field('messageRTF', FieldDataType.UBIART_LIKE_STRING)
  .finish()
  
// MRIM >= 1.20
const MrimChatMessageData = new MessageConstructor()
  .field('packageType', FieldDataType.UINT32)
  .field('fromName', FieldDataType.UNICODE_STRING)
  .field('fromUser', FieldDataType.UBIART_LIKE_STRING)
  .field('reserved0', FieldDataType.UINT32, 0)
  .field('reserved1', FieldDataType.UINT32, 0)
  .finish()

const MrimChatMembersData = new MessageConstructor()
  .field('packageType', FieldDataType.UINT32)
  .field('conferenceName', FieldDataType.UNICODE_STRING)
  .field('_empty', FieldDataType.UINT32, 0)
  .field('membersCount', FieldDataType.UINT32)
  .field('members', FieldDataType.SUBBUFFER)
  .finish()
  
const MrimChatMember = new MessageConstructor()
  .field('email', FieldDataType.UBIART_LIKE_STRING)
  .finish()

const MrimServerMessageData = new MessageConstructor()
  .field('id', FieldDataType.UINT32)
  .field('flags', FieldDataType.UINT32)
  .field('addresser', FieldDataType.UBIART_LIKE_STRING)
  .field('message', FieldDataType.UNICODE_STRING)
  .field('messageRTF', FieldDataType.UBIART_LIKE_STRING)
  .field('reserved0', FieldDataType.UINT32, 0)
  .field('reserved1', FieldDataType.UINT32, 0)
  .field('reserved2', FieldDataType.UINT32, 0)
  .finish()

const MrimServerMessageWithoutChatData = new MessageConstructor()
  .field('id', FieldDataType.UINT32)
  .field('flags', FieldDataType.UINT32)
  .field('addresser', FieldDataType.UBIART_LIKE_STRING)
  .field('message', FieldDataType.UNICODE_STRING)
  .field('messageRTF', FieldDataType.UBIART_LIKE_STRING)
  .finish()

module.exports = { 
  MrimClientMessageData, 
  MrimServerMessageData,

  // Chat
  MrimChatMessageData,
  MrimChatMembersData, 
  MrimChatMember,

  MrimServerMessageWithoutChatData
}
