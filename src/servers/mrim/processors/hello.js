/**
 * @file Обработка запроса "Привет"
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { MrimMessageCommands } = require('../globals')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const config = require('../../../../config')

function processHello (containerHeader, connectionId, logger) {
  logger.debug(`[${connectionId}] hello, stranger!`)

  const awaitsServerTime = containerHeader.protocolVersionMinor >= 20

  const containerHeaderBinary = MrimContainerHeader.writer({
    ...containerHeader,
    packetOrder: 0,
    packetCommand: MrimMessageCommands.HELLO_ACK,
    dataSize: awaitsServerTime ? 0xc : 0x4,
    senderAddress: 0,
    senderPort: 0
  })

  if (awaitsServerTime) {
    return {
      reply: new BinaryConstructor()
        .subbuffer(containerHeaderBinary)
        .integer(config.mrim?.pingTimer ?? 10, 4)
        .integer(Math.floor(Date.now() / 1000), 4)
        .integer(0, 4)
        .finish()
    }
  } else {
    return {
      reply: new BinaryConstructor()
        .subbuffer(containerHeaderBinary)
        .integer(config.mrim?.pingTimer ?? 10, 4)
        .finish()
    }
  }
}

module.exports = { processHello }
