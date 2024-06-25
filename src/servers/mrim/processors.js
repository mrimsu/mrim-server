/**
 * @file Реализация процессоров запросов MRIM
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../constructors/binary')
const { MrimMessageCommands } = require('./globals')
const { MrimLoginData } = require('../../messages/mrim/authorization')
const {
  MrimContactList,
  MrimContactGroup,
  MrimContact
} = require('../../messages/mrim/contact')
const { MrimContainerHeader } = require('../../messages/mrim/container')
const {
  MrimClientMessageData,
  MrimServerMessageData
} = require('../../messages/mrim/messaging')
const {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroup
} = require('../../database')

const MRIM_GROUP_FLAG = 'us'
const MRIM_CONTACT_FLAG = 'uussuussssus'

const MRIM_J2ME_AGENT_CLIENT_INFO = 'client=J2MEAgent version=1.3 build=1937'

function processHello (containerHeader, connectionId, logger) {
  logger.debug(`[${connectionId}] Приветствуем клиента...`)

  const containerHeaderBinary = MrimContainerHeader.writer({
    ...containerHeader,
    packetOrder: 0,
    packetCommand: MrimMessageCommands.HELLO_ACK,
    dataSize: 0x4,
    senderAddress: 0,
    senderPort: 0
  })

  return {
    reply: new BinaryConstructor()
      .subbuffer(containerHeaderBinary)
      .integer(10, 4)
      .finish()
  }
}

async function processLogin (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state
) {
  const loginData = MrimLoginData.reader(packetData)

  logger.debug(`[${connectionId}] !! Вход в аккаунт !!`)
  logger.debug(`[${connectionId}] Логин: ${loginData.login}`)
  logger.debug(`[${connectionId}] Пароль: ${loginData.password}`)
  logger.debug(`[${connectionId}] Статус: ${loginData.status}`)
  logger.debug(`[${connectionId}] Юзерагент: ${loginData.userAgent}`)

  try {
    state.userId = await getUserIdViaCredentials(
      loginData.login.split('@')[0],
      loginData.password
    )
    state.username = loginData.login.split('@')[0];
    state.status = loginData.status;
    global.clients.push(state);
  } catch {
    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.LOGIN_REJ,
            dataSize: 0,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .finish()
    }
  }

  const contactGroups = await getContactGroups(state.userId)
  const contacts = await Promise.all(
    contactGroups.map((contactGroup) =>
      getContactsFromGroup(state.userId, contactGroup.id)
    )
  )

  const contactList = MrimContactList.writer({
    groupCount: contactGroups.length,
    groupFlag: MRIM_GROUP_FLAG,
    contactFlag: MRIM_CONTACT_FLAG,
    groups: Buffer.concat(
      contactGroups.map((contactGroup) =>
        MrimContactGroup.writer({
          name: contactGroup.name
        })
      )
    ),
    contacts: Buffer.concat(
      contacts.flat().map((contact) =>
      {
        let isClientOnline = global.clients.find(({userId}) => userId === contact.id);
        if (isClientOnline !== undefined) {
          // Отправляем пользователю сообщение о том что юзер онлайн
          let dataToSend = new BinaryConstructor()
          .integer(state.status, 4)
          /*.integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // xstatus title i guess
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // xstatus desc
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) */
          .integer((state.username + '@mail.ru').length, 4)
          .subbuffer(Buffer.from(`${state.username}@mail.ru`, 'utf-8'))
          /* .integer(0xFFFFFFFF, 4)
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // client text
          .integer(1, 4)
          .subbuffer(Buffer.from(` `, 'utf-8')) // unknown */
          .finish()

          let dataToSendWithHeader = new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.USER_STATUS,
              dataSize: dataToSend.length,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .subbuffer(dataToSend)
          .finish();

          isClientOnline.socket.write(dataToSendWithHeader);
          logger.debug(`[${connectionId}] Обновление статуса у ${state.username + '@mail.ru'} для ${contact.login + '@mail.ru'}. Данные в HEX: ${dataToSend.toString('hex')}`)
          isClientOnline = isClientOnline.status;
        } else {
          isClientOnline = 0;
        }

        return MrimContact.writer({
          groupIndex: contactGroups.findIndex(
            (contactGroup) => contactGroup.id === contact.contact_group_id
          ),
          email: `${contact.login}@mail.ru`,
          login: contact.login,
          status: isClientOnline, // ONLINE я думаю
          extendedStatusName: '',
          extendedStatusTitle: '',
          extendedStatusText: '',
          clientInfo: MRIM_J2ME_AGENT_CLIENT_INFO
        })
      })
    )
  })

  return {
    reply: [
      MrimContainerHeader.writer({
        ...containerHeader,
        packetCommand: MrimMessageCommands.LOGIN_ACK,
        dataSize: 0,
        senderAddress: 0,
        senderPort: 0
      }),
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.MAILBOX_STATUS,
            dataSize: 0x4,
            senderAddress: 0,
            senderPort: 0
          })
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
            senderPort: 0
          })
        )
        .subbuffer(contactList)
        .finish()
    ]
  }
}

function processMessage (containerHeader, packetData, connectionId, logger, state) {
  const messageData = MrimClientMessageData.reader(packetData)

  logger.debug(
    `[${connectionId}] Получено сообщение -> кому: ${messageData.addresser}, текст: ${messageData.message}`
  )

  let addresserClient = global.clients.find(({username}) => username === messageData.addresser.split('@')[0]);
  if (addresserClient !== undefined) {
    let dataToSend = MrimServerMessageData.writer({
      id: 0x1337,
      flags: messageData.flags,
      addresser: state.username + '@mail.ru',
      message: messageData.message + ' ',
      messageRTF: messageData.messageRTF + ' '
    });

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1337,
            packetCommand: MrimMessageCommands.MESSAGE_ACK,
            dataSize: dataToSend.length,
            senderAddress: 0,
            senderPort: 0
          })
        )
        .subbuffer(dataToSend)
        .finish());

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .integer(0, 4)
          .finish()
      ]
    }
  } else {
    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4,
              senderAddress: 0,
              senderPort: 0
            })
          )
          .integer(0x8006, 4)
          .finish()
      ]
    }
  }
}

module.exports = {
  processHello,
  processLogin,
  processMessage
}
