/**
 * @file Реализация процессоров запросов MRIM
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require("../../constructors/binary");
const { MrimMessageCommands } = require("./globals");
const { MrimLoginData } = require("../../messages/mrim/authorization");
const {
  MrimContactList,
  MrimContactGroup,
  MrimContact,
} = require("../../messages/mrim/contact");
const { MrimContainerHeader } = require("../../messages/mrim/container");
const {
  MrimClientMessageData,
  MrimServerMessageData,
} = require("../../messages/mrim/messaging");
const {
  MrimSearchField,
  MrimAnketaHeader,
} = require("../../messages/mrim/search");
const {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroup,
} = require("../../database");
const { Iconv } = require("iconv");

const MrimSearchRequestFields = {
  USER: 0,
  DOMAIN: 1,
  NICKNAME: 2,
  FIRSTNAME: 3,
  LASTNAME: 4,
  SEX: 5,
  DATE_MIN: 6,
  DATE_MAX: 7,
  CITY_ID: 8,
  ZODIAC: 9,
  BIRTHDAY_MONTH: 10,
  BIRTHDAY_DAY: 11,
  COUNTRY_ID: 12,
  ONLINE: 13,
};

const MRIM_GROUP_FLAG = "us";
const MRIM_CONTACT_FLAG = "uussuussssus";

const MRIM_J2ME_AGENT_CLIENT_INFO = "client=J2MEAgent version=1.3 build=1937";

function processHello(containerHeader, connectionId, logger) {
  logger.debug(`[${connectionId}] Приветствуем клиента...`);

  const containerHeaderBinary = MrimContainerHeader.writer({
    ...containerHeader,
    packetOrder: 0,
    packetCommand: MrimMessageCommands.HELLO_ACK,
    dataSize: 0x4,
    senderAddress: 0,
    senderPort: 0,
  });

  return {
    reply: new BinaryConstructor()
      .subbuffer(containerHeaderBinary)
      .integer(10, 4)
      .finish(),
  };
}

async function processLogin(
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
) {
  const loginData = MrimLoginData.reader(packetData);

  logger.debug(`[${connectionId}] !! Вход в аккаунт !!`);
  logger.debug(`[${connectionId}] Логин: ${loginData.login}`);
  logger.debug(`[${connectionId}] Пароль: ${loginData.password}`);
  logger.debug(`[${connectionId}] Статус: ${loginData.status}`);
  logger.debug(`[${connectionId}] Юзерагент: ${loginData.userAgent}`);

  try {
    state.userId = await getUserIdViaCredentials(
      loginData.login.split("@")[0],
      loginData.password,
    );
  } catch {
    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.LOGIN_REJ,
            dataSize: 0,
            senderAddress: 0,
            senderPort: 0,
          }),
        )
        .finish(),
    };
  }

  const contactGroups = await getContactGroups(state.userId);
  const contacts = await Promise.all(
    contactGroups.map((contactGroup) =>
      getContactsFromGroup(state.userId, contactGroup.id),
    ),
  );

  const contactList = MrimContactList.writer({
    groupCount: contactGroups.length,
    groupFlag: MRIM_GROUP_FLAG,
    contactFlag: MRIM_CONTACT_FLAG,
    groups: Buffer.concat(
      contactGroups.map((contactGroup) =>
        MrimContactGroup.writer({
          name: contactGroup.name,
        }),
      ),
    ),
    contacts: Buffer.concat(
      contacts.flat().map((contact) =>
        MrimContact.writer({
          groupIndex: contactGroups.findIndex(
            (contactGroup) => contactGroup.id === contact.contact_group_id,
          ),
          email: `${contact.login}@mail.ru`,
          login: contact.login,
          status: 1, // ONLINE я думаю
          extendedStatusName: "",
          extendedStatusTitle: "",
          extendedStatusText: "",
          clientInfo: MRIM_J2ME_AGENT_CLIENT_INFO,
        }),
      ),
    ),
  });

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0,
        senderAddress: 0,
        senderPort: 0,
      }),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.MAILBOX_STATUS,
            dataSize: 0x4,
            senderAddress: 0,
            senderPort: 0,
          }),
        )
        .integer(0, 4)
        .finish(),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.CONTACT_LIST2,
            dataSize: contactList.length,
            senderAddress: 0,
            senderPort: 0,
          }),
        )
        .subbuffer(contactList)
        .finish(),
    ],
  };
}

function processMessage(containerHeader, packetData, connectionId, logger) {
  const messageData = MrimClientMessageData.reader(packetData);

  logger.debug(
    `[${connectionId}] Получено сообщение -> кому: ${messageData.addresser}, текст: ${messageData.message}`,
  );

  return {
    reply: [
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0,
            packetCommand: MrimMessageCommands.MESSAGE_STATUS,
            dataSize: 0x4,
            senderAddress: 0,
            senderPort: 0,
          }),
        )
        .integer(0, 4)
        .finish(),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0,
            packetCommand: MrimMessageCommands.MESSAGE_ACK,
            dataSize: packetData.length + 0x4,
            senderAddress: 0,
            senderPort: 0,
          }),
        )
        .subbuffer(
          MrimServerMessageData.writer({
            id: 0x10,
            flags: messageData.flags,
            addresser: messageData.addresser,
            message: messageData.message + " ",
            messageRTF: messageData.messageRTF + " ",
          }),
        )
        .finish(),
    ],
  };
}

async function processSearch(
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
) {
  const packetFields = {};

  while (packetData.length !== 0) {
    const field = MrimSearchField.reader(packetData);
    packetFields[field.key] = field.value;

    // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
    const offset = MrimSearchField.writer(field).length;
    packetData = packetData.subarray(offset);
  }

  const responseFields = {
    Username: packetFields[MrimSearchRequestFields.USER] ?? "kz",
    Nickname: "xXx_Президент_Казахстана_xXx",
    FirstName: "Президент",
    LastName: "Казахстан",
    Location: "1",
    Domain: packetFields[MrimSearchRequestFields.DOMAIN] ?? "mail.ru",
    Birthday: "2007-08-25",
    Zodiac: "6",
    Phone: "+88005553355",
    Sex: "1",
  };

  const anketaHeader = MrimAnketaHeader.writer({
    fieldCount: Object.keys(responseFields).length,
    maxRows: 1,
    serverTime: Math.floor(Date.now() / 1000),
  });

  let anketaInfo = new BinaryConstructor().subbuffer(anketaHeader);

  for (let key in responseFields) {
    key = new Iconv("UTF-8", "CP1251").convert(key ?? "unknown");
    anketaInfo = anketaInfo.integer(key.length, 4).subbuffer(key);
  }

  for (let value of Object.values(responseFields)) {
    value = new Iconv("UTF-8", "CP1251").convert(value ?? "unknown");
    anketaInfo = anketaInfo.integer(value.length, 4).subbuffer(value);
  }

  anketaInfo = anketaInfo.finish();

  return {
    reply: new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          packetCommand: MrimMessageCommands.ANKETA_INFO,
          dataSize: anketaInfo.length,
          senderAddress: 0,
          senderPort: 0,
        }),
      )
      .subbuffer(anketaInfo)
      .finish(),
  };
}

module.exports = {
  processHello,
  processLogin,
  processSearch,
  processMessage,
};
