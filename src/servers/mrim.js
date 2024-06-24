/**
 * @file Реализация MRIM-сервера.
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../constructors/binary')
const { ServerConstructor } = require('../constructors/server')
const { MrimLoginData } = require('../messages/mrim/authorization')
const { MrimContainerHeader } = require('../messages/mrim/container')
const {
  MrimClientMessageData,
  MrimServerMessageData
} = require('../messages/mrim/messaging')

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
  MESSAGE_STATUS: 0x1012
}

const MRIM_HEADER_CONTAINER_SIZE = 0x2c

function onConnection (socket, connectionId, logger, _variables) {
  socket.on('data', onData(socket, connectionId, logger))
}

function onData (socket, connectionId, logger) {
  return (data) => {
    const header = MrimContainerHeader.reader(data)

    logger.debug('===============================================')
    logger.debug(
      `Версия протокола: ${header.protocolVersionMajor}.${header.protocolVersionMinor}`
    )
    logger.debug(`Последовательность пакета: ${header.packetOrder}`)
    logger.debug(`Команда данных: ${header.packetCommand}`)
    logger.debug(`Размер данных: ${header.dataSize}`)
    logger.debug('===============================================')

    const packetData = data.subarray(
      MRIM_HEADER_CONTAINER_SIZE,
      MRIM_HEADER_CONTAINER_SIZE + header.dataSize
    )

    const result = processPacket(header, packetData, connectionId, logger)

    if (result === undefined) {
      return
    }

    if (result.end === true) {
      socket.end(result.reply)
    } else {
      if (Array.isArray(result.reply)) {
        for (const reply of result.reply) {
          socket.write(reply)
        }
      } else {
        socket.write(result.reply)
      }
    }
  }
}

function processPacket (containerHeader, packetData, connectionId, logger) {
  switch (containerHeader.packetCommand) {
    case MrimMessageCommands.HELLO: {
      logger.debug(
        `[${connectionId}] От клиента пакет определён как MRIM_CS_HELLO`
      )
      logger.debug(`[${connectionId}] Отправляем MRIM_CS_HELLO_ACK...`)

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
    case MrimMessageCommands.LOGIN2: {
      logger.debug(
        `[${connectionId}] От клиента пакет определён как MRIM_CS_LOGIN2`
      )
      logger.debug(`[${connectionId}] Временно отправляем MRIM_CS_LOGIN_ACK`)

      const loginData = MrimLoginData.reader(packetData)

      logger.debug('!! Вход в аккаунт !!')
      logger.debug(`ID подключения: ${connectionId}`)
      logger.debug(`Логин: ${loginData.login}`)
      logger.debug(`Пароль: ${loginData.password}`)
      logger.debug(`Статус: ${loginData.status}`)
      logger.debug(`Юзерагент: ${loginData.userAgent}`)

      const fakeContactList = Buffer.from(
        '00000000020000000200000075730C000000757573737575737373737573080000000700000047656E6572616C08000000040000005465737408000000010000000F000000737570706F7274406D61696C2E727507000000536C757A686261000000000100000000000000000000000000000000000000FF03000027000000636C69656E743D4A324D454167656E742076657273696F6E3D312E33206275696C643D31393337',
        'hex'
      )

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
            .integer(3, 4)
            .finish(),
          new BinaryConstructor()
            .subbuffer(
              MrimContainerHeader.writer({
                ...containerHeader,
                packetCommand: MrimMessageCommands.CONTACT_LIST2,
                dataSize: fakeContactList.length,
                senderAddress: 0,
                senderPort: 0
              })
            )
            .subbuffer(fakeContactList)
            .finish()
        ]
      }
    }
    case MrimMessageCommands.MESSAGE: {
      const messageData = MrimClientMessageData.reader(packetData)
      logger.debug(
        `messageData получен -> flags: ${messageData.flags}, addresser: ${messageData.addresser}, message: ${messageData.message}`
      )

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
                senderPort: 0
              })
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
                senderPort: 0
              })
            )
            .subbuffer(
              MrimServerMessageData.writer({
                id: 0x10,
                flags: messageData.flags,
                addresser: messageData.addresser,
                message: messageData.message + ' ',
                messageRTF: messageData.messageRTF + ' '
              })
            )
            .finish()
        ]
      }
    }
    case MrimMessageCommands.PING: {
      logger.debug(`[${connectionId}] От клиента прилетел пинг. Игнорируем`)
      break
    }
    default:
      logger.debug(JSON.stringify(containerHeader))
  }
}

// TODO mikhail переписать на STEP_BY_STEP
function createMrimServer (options) {
  return new ServerConstructor({
    logger: options.logger,
    onConnection
  }).finish()
}

module.exports = createMrimServer
