/**
 * @file Реализация сервера-перенаправлятора
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const config = require('../../config')
const { ServerConstructor } = require('../constructors/server')

const LOCAL_IP_ADDRESS = '127.0.0.1:2041'

function onConnection (socket, connectionId, logger, variables) {
  socket.end(variables.ipAddress)
  logger.info(`[${connectionId}] Клиенту отправлен IP-адрес`)
}

function createRedirectorServer (options) {
  return new ServerConstructor({
    logger: options.logger,
    onConnection,
    variables: { ipAddress: config.redirector?.redirectTo ?? LOCAL_IP_ADDRESS }
  }).finish()
}

module.exports = createRedirectorServer
