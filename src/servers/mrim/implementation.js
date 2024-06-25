/**
 * @file Реализация обработчика подключения к серверу
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { MrimMessageCommands } = require('./globals')
const { MrimContainerHeader } = require('../../messages/mrim/container')
const { processHello, processLogin, processMessage } = require('./processors')

const MRIM_HEADER_CONTAINER_SIZE = 0x2c

function onConnection (socket, connectionId, logger, _variables) {
  const state = { userId: null, username: null, status: null, socket: socket }
  socket.on('data', onData(socket, connectionId, logger, state));
  socket.on('close', onClose(socket, connectionId, logger, state));
}

function onData (socket, connectionId, logger, state) {
  return (data) => {
    const header = MrimContainerHeader.reader(data)

    logger.debug(
      `[${connectionId}] ===============================================`
    )
    logger.debug(
      `[${connectionId}] Версия протокола: ${header.protocolVersionMajor}.${header.protocolVersionMinor}`
    )
    logger.debug(
      `[${connectionId}] Последовательность пакета: ${header.packetOrder}`
    )
    logger.debug(`[${connectionId}] Команда данных: ${header.packetCommand}`)
    logger.debug(`[${connectionId}] Размер данных: ${header.dataSize}`)
    logger.debug(`[${connectionId}] Данные в HEX: ${data.toString('hex')}`)
    logger.debug(
      `[${connectionId}] ===============================================`
    )

    const packetData = data.subarray(
      MRIM_HEADER_CONTAINER_SIZE,
      MRIM_HEADER_CONTAINER_SIZE + header.dataSize
    )

    processPacket(header, packetData, connectionId, logger, state).then(
      (result) => {
        if (result === undefined) {
          return
        }

        if (result.end) {
          logger.debug(
            `[${connectionId}] Ответ от сервера -> ${result.reply.toString('hex')}`
          )
          return socket.end(result.reply)
        }

        const data = Array.isArray(result.reply)
          ? result.reply
          : [result.reply]

        for (const reply of data) {
          logger.debug(
            `[${connectionId}] Ответ от сервера -> ${reply.toString('hex')}`
          )
          socket.write(reply)
        }
      }
    )
  }
}

function onClose (socket, connectionId, logger, state) {
  return () => {
    if (global.clients.length > 0) {
      let clientIndex = global.clients.findIndex(({userId}) => userId === state.userId);
      global.clients.splice(clientIndex, 0);
      logger.debug(
        `[${connectionId}] !!! Закрыто соединение для ${state.username}`
      )
    }
  }
}

async function processPacket (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state
) {
  switch (containerHeader.packetCommand) {
    case MrimMessageCommands.HELLO:
      return processHello(containerHeader, connectionId, logger)
    case MrimMessageCommands.LOGIN2:
      return processLogin(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state
      )
    case MrimMessageCommands.MESSAGE:
      return processMessage(containerHeader, packetData, connectionId, logger, state)
    case MrimMessageCommands.PING: {
      logger.debug(`[${connectionId}] От клиента прилетел пинг. Игнорируем`)
      break
    }
  }
}

module.exports = onConnection
