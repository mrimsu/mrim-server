/**
 * @file Общие глобальные переменные MRIM-сервера
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const MrimMessageCommands = {
  // Hello and login
  HELLO: 0x1001,
  HELLO_ACK: 0x1002,
  LOGIN_ACK: 0x1004,
  LOGIN_REJ: 0x1005,
  PING: 0x1006,
  LOGIN2: 0x1038,
  LOGIN3: 0x1078,
  USER_INFO: 0x1015,
  // Contacts and statuses
  CONTACT_LIST2: 0x1037,
  USER_STATUS: 0x100f,
  // Email (dummy)
  MAILBOX_STATUS: 0x1033,
  MPOP_SESSION: 0x1024,
  // Messages
  MESSAGE: 0x1008,
  MESSAGE_ACK: 0x1009,
  MESSAGE_STATUS: 0x1012,
  // Contacts
  ADD_CONTACT: 0x1019,
  ADD_CONTACT_ACK: 0x101a,
  MODIFY_CONTACT: 0x101b,
  MODIFY_CONTACT_ACK: 0x101c,
  AUTHORIZE: 0x1020,
  AUTHORIZE_ACK: 0x1021,
  // Status
  CHANGE_STATUS: 0x1022,
  // Search
  ANKETA_INFO: 0x1028,
  WP_REQUEST: 0x1029,
  // Games
  GAME: 0x1035,
  // File Transfer & VoIP
  FILE_TRANSFER: 0x1026,
  FILE_TRANSFER_ACK: 0x1027,
  CALL: 0x1049,
  CALL_ACK: 0x1032,
  // Logout
  LOGOUT: 0x1013
}

module.exports = { MrimMessageCommands }
