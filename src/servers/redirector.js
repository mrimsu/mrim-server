/**
 * @file Реализация сервера-перенаправлятора
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { ServerConstructor } = require('../constructors/server')

function onConnection (socket, connectionId, logger, variables) {
  socket.end(variables.ipAddress)
  logger.info(`[${connectionId}] Клиенту отправлен IP-адреса`)
}

function createRedirectorServer (options) {
  return new ServerConstructor({
    logger: options.logger,
    onConnection,
    variables: { ipAddress: '127.0.0.1:2041' }
  }).finish()
}

module.exports = createRedirectorServer
