/**
 * @file Обработка сообщений
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { BinaryReader } = require('../../../binary-reader')
const {
  MessageConstructor,
  FieldDataType
} = require('../../../constructors/message')
const {
  MrimMessageCommands,
  MrimMessageFlags,
  MrimMessageErrors,
} = require('../globals')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const {
  MrimClientMessageData,
  MrimServerMessageData
} = require('../../../messages/mrim/messaging')
const {
  addContactMSG,
  getIdViaLogin,
  getOfflineMessages,
  cleanupOfflineMessages,
  sendOfflineMessage
} = require('../../../database')
const { _checkIfLoggedIn } = require('./core')
const config = require('../../../../config')
const { Iconv } = require('iconv')

async function processMessage (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  let messageData = MrimClientMessageData.reader(packetData, state.utf16capable)

  // фикс для азербайджанской разработки
  if (state.clientName === 'QIP Infium') {
    messageData = MrimClientMessageData.reader(packetData, true)
  }

  if (messageData.flags & MrimMessageFlags.MULTICAST === 0x0) {
    logger.debug(
      `[${connectionId}] sending message from ${state.username} to ${messageData.addresser}`
    )
  }

  if (messageData.message.length > 5000) {
    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4
            })
          )
          .integer(MrimMessageErrors.TOO_MUCH, 4)
          .finish()
      ]
    }
  }

  if (config.adminProfile?.enabled && !(messageData.flags & 0x400) &&
    messageData.addresser === `${config.adminProfile?.username}@${config.adminProfile?.domain}`) {
    logger.debug(`[${connectionId}] user ${state.username} messaged to admin. 'll just send prepared message :)`)

    let preparedMessage = config.adminProfile.defaultMessage

    if (messageData.message.toLowerCase().includes('debug')) {
      preparedMessage = `DEBUG INFO:\nraw useragent (new): ${state.userAgent}
raw useragent (old): ${state.oldUserAgent}
protocol version: ${state.protocolVersionMajor}.${state.protocolVersionMinor}
ssl: ${state.ssl}
utf16 capable: ${state.utf16capable}`
    }

    const dataToSend = MrimServerMessageData.writer({
      id: containerHeader.packetOrder + 1,
      flags: 0 + (state.utf16capable == true ? MrimMessageFlags.v1p16 : 0),
      addresser: `${config.adminProfile?.username}@${config.adminProfile?.domain}`,
      message: preparedMessage,
      messageRTF: ''
    }, state.utf16capable)

    return {
      reply: [
        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder,
              packetCommand: MrimMessageCommands.MESSAGE_STATUS,
              dataSize: 4
            })
          )
          .integer(MrimMessageErrors.SUCCESS, 4)
          .finish(),

        new BinaryConstructor()
          .subbuffer(
            MrimContainerHeader.writer({
              ...containerHeader,
              packetOrder: containerHeader.packetOrder + 1,
              packetCommand: MrimMessageCommands.MESSAGE_ACK,
              dataSize: dataToSend.length
            })
          )
          .subbuffer(dataToSend)
          .finish()
      ]
    }
  }

  if (messageData.flags & MrimMessageFlags.AUTHORIZE) {
    logger.debug(
      `[${connectionId}] auth request via MRIM_CS_MESSAGE from ${state.username}@${state.domain} to ${messageData.addresser}`
    )

    let authResult = await addContactMSG(
      state.userId,
      messageData.addresser.split('@')[0],
      messageData.addresser.split('@')[1]
    )

    if (authResult === true) {
      // TODO: перенести это в contacts
      const MrimAddContactData = new MessageConstructor()
        .field('addresser', FieldDataType.UBIART_LIKE_STRING)
        .finish()

      // сообщаем о такой прекрасной вести клиенту
      const contactUsername = messageData.addresser
      const clientAddresser = global.clients.find(
        ({ username, domain }) => username === contactUsername.split('@')[0] &&
                                  domain === contactUsername.split('@')[1]
      )

      if (clientAddresser !== undefined) {
        const authorizeReplyToContact = MrimAddContactData.writer({
          addresser: `${state.username}@${state.domain}`
        })

        clientAddresser.socket.write(
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
                dataSize: authorizeReplyToContact.length
              })
            )
            .subbuffer(authorizeReplyToContact)
            .finish()
        )
      }

      const authorizeReply = MrimAddContactData.writer({
        addresser: messageData.addresser
      })

      return {
        reply: [
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder,
                packetCommand: MrimMessageCommands.MESSAGE_STATUS,
                dataSize: 4
              })
            )
            .integer(MrimMessageErrors.SUCCESS, 4)
            .finish(),
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder+1,
                packetCommand: MrimMessageCommands.AUTHORIZE_ACK,
                dataSize: authorizeReply.length
              })
            )
            .subbuffer(authorizeReply)
            .finish(),

        ]
      }
    }
  }

  let receivers = [messageData.addresser]

  if (messageData.flags & MrimMessageFlags.MULTICAST) {
    let multicastData = Buffer.from(messageData.addresser)
    receivers = []
    let binaryReader = new BinaryReader(multicastData, this.endianness)

    // limited to 50 users by proto
    for (i = 0; i < 50; i++) {
      if (binaryReader.offset >= multicastData.length) break

      let contact = new Iconv('CP1251', 'UTF-8')
              .convert(
                Buffer.from(
                  binaryReader.readUint8Array(binaryReader.readUint32())
                )
              )
              .toString('utf-8')

      receivers.push(contact)
    }

    logger.debug(
      `[${connectionId}] sending multicast message from ${state.username} to ${receivers.join(', ')}`
    )
  } else {
    logger.debug(
      `[${connectionId}] sending message from ${state.username} to ${receivers[0]}`
    )
  }

  let results = await Promise.all(receivers.map(async (receiver) => {
    const addresserClient = global.clients.find(
      ({ username, domain }) => username === receiver.split('@')[0] &&
                    domain === receiver.split('@')[1]
    )

    if (addresserClient !== undefined) {
      const dataToSend = MrimServerMessageData.writer({
        id: Math.random() * 0xFFFFFFFF,
        flags: messageData.flags + (addresserClient.utf16capable == true ? MrimMessageFlags.v1p16 : 0),
        addresser: `${state.username}@${state.domain}`,
        message: messageData.message ?? ' ',
        messageRTF: messageData.messageRTF ?? ' '
      }, addresserClient.utf16capable)

      // send message UNTIL the proto version is less then 8 and "pers is typing" flag is set
      if (!(addresserClient.protocolVersionMinor <= 8 && messageData.flags & MrimMessageFlags.NOTIFY)) {
        addresserClient.socket.write(
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                protocolVersionMinor: addresserClient.protocolVersionMinor,
                packetOrder: Math.random() * 0xFFFFFFFF,
                packetCommand: MrimMessageCommands.MESSAGE_ACK,
                dataSize: dataToSend.length
              })
            )
            .subbuffer(dataToSend)
            .finish()
        )
      }

      return {
        reply: 
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder,
                packetCommand: MrimMessageCommands.MESSAGE_STATUS,
                dataSize: 4
              })
            )
            .integer(MrimMessageErrors.SUCCESS, 4)
            .finish()
        
      }
    } else {
      let messageStatus = MrimMessageErrors.SUCCESS
      let receiverId
      try {
        receiverId = await getIdViaLogin(messageData.addresser.split('@')[0], messageData.addresser.split('@')[1])
      } catch (e) {
        return {
          reply: 
            new BinaryConstructor()
              .subbuffer(
                MrimContainerHeader.writer({
                  ...containerHeader,
                  packetOrder: containerHeader.packetOrder,
                  packetCommand: MrimMessageCommands.MESSAGE_STATUS,
                  dataSize: 4
                })
              )
              .integer(MrimMessageErrors.NO_USER, 4)
              .finish()
          
        }
      }
      const messages = await getOfflineMessages(receiverId)

      if ([0x0, 0x80].includes(messageData.flags)) {
        if (messages.length > (config.mrim.offlineMessagesLimit ?? 20)) {
          messageStatus = MrimMessageErrors.OFFLINE_LIMIT
        } else {
          sendOfflineMessage(state.userId, receiverId, messageData.message)
          messageStatus = MrimMessageErrors.SUCCESS
        }
      } else {
        messageStatus = MrimMessageErrors.OFFLINE_DISABLED
      }

      return {
        reply: 
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetOrder: containerHeader.packetOrder,
                packetCommand: MrimMessageCommands.MESSAGE_STATUS,
                dataSize: 4
              })
            )
            .integer(messageStatus, 4)
            .finish()
        
      }
    }
  }))

  return {
    reply: results.map(result => result.reply)
  }
}

async function processDeleteOfflineMsg (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  // fsr clients don't send all IDs properly and it got duplicated on logon
  // what we do is just cleaning up all of the messages
  // if client executes this cmd, we already know that it supports offline msgs
  // and it will get it
  await cleanupOfflineMessages(state.userId)

  logger.debug(`[${connectionId}] ${state.username}@${state.domain} cleaned up offline messages`)
}

module.exports = { processMessage, processDeleteOfflineMsg }
