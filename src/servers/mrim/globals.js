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
  // Contacts and statuses
  CONTACT_LIST2: 0x1037,
  USER_STATUS: 0x100F,
  // Email (dummy)
  MAILBOX_STATUS: 0x1033,
  // Messages
  MESSAGE: 0x1008,
  MESSAGE_ACK: 0x1009,
  MESSAGE_STATUS: 0x1012
}

module.exports = { MrimMessageCommands }
