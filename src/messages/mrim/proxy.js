/**
 * @file Proxy MRIM
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')

const MrimProxyRequest = new MessageConstructor()
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('id', FieldDataType.UINT32)
  .field('proxy_type', FieldDataType.UINT32)
  .field('files', FieldDataType.UBIART_LIKE_STRING)
  .field('proxy_ip', FieldDataType.UBIART_LIKE_STRING)
  .field('session_id_high', FieldDataType.UINT32)
  .field('session_id_low', FieldDataType.UINT32)
  .field('session_id_high_second', FieldDataType.UINT32)
  .field('session_id_low_second', FieldDataType.UINT32)
  .field('files_unicode', FieldDataType.UNICODE_STRING)
  .finish()
  
const MrimProxyAck = new MessageConstructor()
  .field('status', FieldDataType.UINT32)
  .field('contact', FieldDataType.UBIART_LIKE_STRING)
  .field('id', FieldDataType.UINT32)
  .field('proxy_type', FieldDataType.UINT32)
  .field('files', FieldDataType.UBIART_LIKE_STRING)
  .field('proxy_ip', FieldDataType.UBIART_LIKE_STRING)
  .field('session_id_high', FieldDataType.UINT32)
  .field('session_id_low', FieldDataType.UINT32)
  .field('session_id_high_second', FieldDataType.UINT32)
  .field('session_id_low_second', FieldDataType.UINT32)
  .field('files_unicode', FieldDataType.UNICODE_STRING)
  .finish()

const MrimProxyHelloStranger = new MessageConstructor()
  .field('session_id_high', FieldDataType.UINT32)
  .field('session_id_low', FieldDataType.UINT32)
  .field('session_id_high_second', FieldDataType.UINT32)
  .field('session_id_low_second', FieldDataType.UINT32)
  .finish()

module.exports = { MrimProxyRequest, MrimProxyAck, MrimProxyHelloStranger }
