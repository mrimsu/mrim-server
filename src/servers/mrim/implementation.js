/**
 * @file Реализация обработчика подключения к серверу
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { MrimMessageCommands } = require('./globals')
const BinaryConstructor = require('../../constructors/binary')
const { MrimContainerHeader } = require('../../messages/mrim/container')
const {
  processHello,
  processLogin,
  processLoginThree,
  processMessage,
  processSearch,
  processAddContact,
  processModifyContact,
  processAuthorizeContact,
  processChangeStatus,
  processGame,
  processFileTransfer,
  processFileTransferAnswer,
  processCall,
  processCallAnswer
} = require('./processors')

const config = require('../../../config')

const MRIM_HEADER_CONTAINER_SIZE = 0x2c

function onConnection (socket, connectionId, logger, variables) {
  const state = { userId: null, username: null, status: null, socket }
  socket.on('data', onData(socket, connectionId, logger, state, variables))
  socket.on('close', onClose(socket, connectionId, logger, state, variables))
  socket.on('error', onClose(socket, connectionId, logger, state, variables))
}

const timeoutTimer = []

function onData (socket, connectionId, logger, state, variables) {
  return (data) => {
    let header;
    let packetData;

    if (!state.waitForData && !state.fragmented) {
      try {
        header = MrimContainerHeader.reader(data)
      } catch {
        return socket.end()
      }

      if (header.packetCommand !== MrimMessageCommands.PING && header.packetCommand !== MrimMessageCommands.MPOP_SESSION) {
        logger.debug(
          `[${connectionId}] user: ${state.username ?? '@!unknown!@'}, proto ver: ${header.protocolVersionMajor}.${header.protocolVersionMinor}, ` +
          `command: ${header.packetCommand} (${Object.keys(MrimMessageCommands).find(name => MrimMessageCommands[name] === header.packetCommand)}), ` + 
          `data.length: ${header.dataSize}, hex: ${data.toString('hex')}`
        )
      }

      packetData = data.subarray(
        MRIM_HEADER_CONTAINER_SIZE,
        MRIM_HEADER_CONTAINER_SIZE + header.dataSize
      )

      if (header.dataSize > 0 && packetData.length < header.dataSize) {
        // incomplete packet, wait for more data
        state.fragmented = true;
        state.lastHeader = header;
        state.lastData = packetData;
        return;
      } else if (header.dataSize > 0 && header.dataSize !== packetData.length) {
        state.waitForData = true;
        state.lastHeader = header;
        return;
      }
    } else if (state.fragmented) {
      // fragmented packet, concatenate
      header = state.lastHeader;
      packetData = Buffer.concat([state.lastData, data]);

      // debug
      logger.debug(`[${connectionId}] continuing receiving data, hex: ${packetData.toString('hex')}`)

      if (packetData.length < header.dataSize) {
        state.fragmented = true;
        state.lastHeader = header;
        state.lastData = packetData;
      } else {
        // reset
        state.fragmented = false;
        state.lastHeader = null;
        state.lastData = null;
      }
    } else {
      header = state.lastHeader;
      packetData = data;

      // reset
      state.waitForData = false;
      state.lastHeader = null;

      // debug
      logger.debug(`[${connectionId}] continuing receiving data, hex: ${packetData.toString('hex')}`)
    }

    try {
      Promise.resolve(processPacket(header, packetData, connectionId, logger, state, variables))
        .then((result) => {
          if (result === undefined) {
            return
          }

          if (result.end) {
            if (result.reply) {
              logger.debug(
                `[${connectionId}] reply from server in hex: ${result.reply.toString('hex')}`
              )
            }
            return socket.end(result.reply)
          }

          const replies = Array.isArray(result.reply)
            ? result.reply
            : [result.reply]

          for (const reply of replies) {
            logger.debug(
              `[${connectionId}] reply from server in hex: ${reply.toString('hex')}`
            )
            socket.write(reply)
          }
        })
        .catch((err) => {
          logger.error(
            `[${connectionId}] whoopsy while processing data: ${err && err.stack ? err.stack : err}`
          )
        })
    } catch (err) {
      logger.error(
        `[${connectionId}] whoopsy while processing data: ${err.stack}`
      )
    }
  }
}

function onClose (socket, connectionId, logger, state, variables) {
  return async () => {
    if (global.clients.length > 0) {
      disconnectClient(connectionId, logger, state)
      logger.debug(
        `[${connectionId}] !!! connection closed for ${state.username}`
      )
    }
  }
}

async function disconnectClient(connectionId, logger, state) {
  const clientIndex = global.clients.findIndex(
    ({ connectionId }) => connectionId === state.connectionId
  )

  const sameUserSessionsCount = global.clients.filter(
    ({ username }) => username === state.username
  ).length;

  // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
  if (clientIndex && sameUserSessionsCount <= 1) {
    await processChangeStatus(
        {
          protocolVersionMajor: state.protocolVersionMajor,
          protocolVersionMinor: state.protocolVersionMinor,
          packetOrder: 0
      },
      new BinaryConstructor()
      .integer(0, 4)
      .integer(0, 4)
      .integer(0, 4)
      .integer(0, 4)
      .integer(0, 4)
      .finish(),
      connectionId,
      logger,
      state,
      null
    )
    
    if (clientIndex !== -1) {
      global.clients.splice(clientIndex, 1)
    } 

    clearTimeout(timeoutTimer[connectionId])
    delete timeoutTimer[connectionId]
  }
}

async function processPacket (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  switch (containerHeader.packetCommand) {
    case MrimMessageCommands.HELLO:
      return processHello(containerHeader, connectionId, logger)
    // MRIM <= 1.20
    case MrimMessageCommands.LOGIN2:
      return processLogin(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    // MRIM >= 1.21
    case MrimMessageCommands.LOGIN3:
      return processLoginThree(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.MESSAGE:
      return processMessage(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.WP_REQUEST:
      return processSearch(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state
      )
    case MrimMessageCommands.ADD_CONTACT:
      return processAddContact(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.AUTHORIZE:
      return processAuthorizeContact(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.MODIFY_CONTACT:
      return processModifyContact(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.CHANGE_STATUS:
      return processChangeStatus(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.GAME:
      return processGame(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.FILE_TRANSFER:
      return processFileTransfer(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.FILE_TRANSFER_ACK:
      return processFileTransferAnswer(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.CALL:
      return processCall(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    case MrimMessageCommands.CALL_ACK:
      return processCallAnswer(
        containerHeader,
        packetData,
        connectionId,
        logger,
        state,
        variables
      )
    /* case MrimMessageCommands.MPOP_SESSION:
      return {
        reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: 0x1025,
            dataSize: 4+4+5
          })
        )
        .integer(1, 4)
        .integer(5, 4)
        .subbuffer(Buffer.from(`testt`, 'utf8'))
        .finish()
      } */
    case MrimMessageCommands.PING: {
      if (timeoutTimer[connectionId] !== undefined) {
        timeoutTimer[connectionId].refresh()
      } else {
        const PING_TIMER = (config?.mrim?.pingTimer ?? 10) * 1000
        timeoutTimer[connectionId] = setTimeout((connectionId, state, logger) => {
          logger.debug(`[${connectionId}] user ${state.username} timed out (MRIM_CS_PING)`)
          state.socket.end();
          disconnectClient(connectionId, logger, state)
        }, PING_TIMER + 3000, connectionId, state, logger)
        timeoutTimer[connectionId].unref()
      }
    }
  }
}

module.exports = onConnection
