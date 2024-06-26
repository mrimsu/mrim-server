/**
 * @file Общие глобальные переменные MRIM-сервера
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const MrimMessageCommands = {
  HELLO: 0x1001,
  HELLO_ACK: 0x1002,
  LOGIN_ACK: 0x1004,
  LOGIN_REJ: 0x1005,
  PING: 0x1006,
  LOGIN2: 0x1038,
  CONTACT_LIST2: 0x1037,
  MAILBOX_STATUS: 0x1033,
  MESSAGE: 0x1008,
  MESSAGE_ACK: 0x1009,
  MESSAGE_STATUS: 0x1012,
  ADD_CONTACT: 0x1019,
  ADD_CONTACT_ACK: 0x101a,
  AUTHORIZE_ACK: 0x1021,
  ANKETA_INFO: 0x1028,
  WP_REQUEST: 0x1029
}

module.exports = { MrimMessageCommands }
