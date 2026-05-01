/**
 * @file P2P функции для игр, файлов и звонков
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { MrimMessageCommands } = require('../globals')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const { MrimGameData, MrimGameNewerData } = require('../../../messages/mrim/games')
const { MrimFileTransfer, MrimFileTransferAnswer } = require('../../../messages/mrim/files')
const { MrimCall, MrimCallAnswer } = require('../../../messages/mrim/calls')
const { _checkIfLoggedIn } = require('./core')

async function processGame (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if (await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  let packet
  if (state.protocolVersionMinor < 15) {
    packet = MrimGameData.reader(packetData)
  } else {
    packet = MrimGameNewerData.reader(packetData)
  }

  // так ну неплохо надо бы переправить данный пакет нужному получателю
  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.contact.split('@')[0] &&
                              domain === packet.contact.split('@')[1]
  )

  if (addresserClient !== undefined) {
    // basically we're just pushin same data to client
    const gameData = {
      contact: `${state.username}@${state.domain}`,
      session: packet.session,
      internal_msg: packet.internal_msg,
      message_id: packet.message_id,
      time_send: packet.time_send ?? 0,
      data: packet.data
    }

    const dataToSend = addresserClient.protocolVersionMinor >= 15
      ? MrimGameNewerData.writer(gameData)
      : MrimGameData.writer(gameData)

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1337,
            packetCommand: MrimMessageCommands.GAME,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimGameData.writer({
          contact: packet.contact,
          session: packet.session,
          internal_msg: 10, // means no user found bruv
          message_id: packet.message_id,
          data: ''
        })
    }
  }
}

async function processFileTransfer (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if (await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const packet = MrimFileTransfer.reader(packetData)

  // так ну неплохо надо бы переправить данный пакет нужному получателю
  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined) {
    // иииииииии мы тупо шлём тоже самое блять)
    const dataToSend = MrimFileTransfer.writer({
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      files_size: packet.files_size,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1337,
            packetCommand: MrimMessageCommands.FILE_TRANSFER,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimFileTransferAnswer.writer({
          status: 2, // Unknown error
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id,
          data: ''
        })
    }
  }
}

async function processFileTransferAnswer (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if (await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const packet = MrimFileTransferAnswer.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined || packet.status !== 4) {
    const dataToSend = MrimFileTransferAnswer.writer({
      status: packet.status,
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x1488,
            packetCommand: MrimMessageCommands.FILE_TRANSFER_ACK,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimFileTransferAnswer.writer({
          status: 2, // Unknown error
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id,
          data: ''
        })
    }
  }
}

async function processCall (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if (await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const packet = MrimCall.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined || packet.status !== 4) {
    const dataToSend = MrimCall.writer({
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x228,
            packetCommand: MrimMessageCommands.CALL2,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimCallAnswer.writer({
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id,
          status: 0 // Unknown error
        })
    }
  }
}

async function processCallAnswer (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if (await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const packet = MrimCallAnswer.reader(packetData)

  const addresserClient = global.clients.find(
    ({ username, domain }) => username === packet.to_or_from.split('@')[0] &&
                              domain === packet.to_or_from.split('@')[1]
  )

  if (addresserClient !== undefined) {
    const dataToSend = MrimCallAnswer.writer({
      status: packet.status,
      to_or_from: `${state.username}@${state.domain}`,
      unique_id: packet.unique_id,
      data: packet.data
    })

    addresserClient.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetOrder: 0x265,
            packetCommand: MrimMessageCommands.CALL_ACK,
            dataSize: dataToSend.length
          })
        )
        .subbuffer(dataToSend)
        .finish()
    )
  } else {
    return {
      reply:
        MrimCall.writer({
          status: 2, // Unknown error
          to_or_from: packet.to_or_from,
          unique_id: packet.unique_id
        })
    }
  }
}

module.exports = { processGame, processFileTransfer, processFileTransferAnswer, processCall, processCallAnswer }
