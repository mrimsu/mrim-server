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
  NEW_MAIL: 0x1048,
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

const MrimStatus = {
  OFFLINE: 0x0,
  ONLINE: 0x1,
  AWAY: 0x2,
  XSTATUS: 0x4,
  INVISIBLE: 0x80000001
}

const MrimContactFlags = {
  // Type of contacts
  GROUP: 0x02,
  CHAT: 0x80,
  PHONE_CONTACT: 0x100000,

  // Groups
  NEVER_VISIBLE: 0x04,
  ALWAYS_VISIBLE: 0x08,
  IGNORED: 0x10,

  // Technical info
  UNICODE_NICKNAME: 0x200
}

const MrimMessageFlags = {
  OFFLINE: 0x1, // received message when user was offline (s->c only)
  BROADCAST: 0x2,
  NORECV: 0x4,
  AUTHORIZE: 0x8,
  URL: 0x20,
  SYSTEM: 0x40,
  RTF: 0x80,
  CONTACT: 0x200,
  NOTIFY: 0x400,
  SMS: 0x800,
  MULTICAST: 0x1000,
  WAKEUP: 0x4000,
  FLASH: 0x8000,
  FROM_AUTH_USER: 0x40000,
  v1p16: 0x100000, // unicode convertion
  MULTICHAT: 0x400000
}

const MrimMessageErrors = {
  SUCCESS: 0x0,
  OFFLINE_LIMIT: 0x8004,
  TOO_MUCH: 0x8005,
  OFFLINE_DISABLED: 0x8006
}

const MrimCallStatus = {
  DENY: 0x0,
  ACCEPT: 0x1,
  PROXY: 0x4,
}

const MrimConferenceStatus = {
  MESSAGE: 0, // s<->c
	GET_MEMBERS: 1, // c->s , ask for members list
	GET_MEMBERS_ACK: 2, // s->c list of chat members arrived
	ADD_MEMBERS: 3, // s->c someone has added some users to chat
	ATTACHED: 4, // s->c user adds multichat contact to his contact list
	DETACHED: 5, // s->c someone has left the chat himself
	DESTROYED: 6, // s->c conference is destroyed nafig
	INVITE: 7, // someone has invited me to chat
	DEL_MEMBERS: 8, // someone has deleted some users from chat
	TURN_OUT: 9 // s->c someone has delete me from chat 
}

module.exports = { MrimMessageCommands, MrimStatus, MrimContactFlags, MrimMessageFlags, MrimMessageErrors, MrimConferenceStatus }
