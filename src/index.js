/**
 * @file Главный скрипт пакета
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const config = require('../config')
const winston = require('winston')

const createRedirectorServer = require('./servers/redirector')
const createSocksServer = require('./servers/socks')
const createMrimServer = require('./servers/mrim')

const DEFAULT_MRIM_PORT = 2041
const DEFAULT_REDIRECTOR_PORT = 2042
const DEFAULT_SOCKS5_PORT = 8080
const LOCALHOST = 'localhost' // пиздец

function main () {
  const logger = winston.createLogger({
    level: config.logger?.level ?? 'debug',
    format: winston.format.cli(),
    transports: [new winston.transports.Console()]
  })

  const servers = {}

  if (
    !config.mrim.enabled &&
    !config.redirector.enabled &&
    !config.socks.enabled
  ) {
    config.mrim.enabled = true
  }

  if (config.mrim.enabled) {
    servers.mrim = createMrimServer({ logger })

    const listener = servers.mrim.listen(
      config.mrim?.serverPort ?? DEFAULT_MRIM_PORT,
      config.mrim?.serverHostname ?? LOCALHOST,
      () => {
        const { address, port } = listener.address()
        return logger.info(
          `MRIM сервер запущен -> адрес: ${address}, порт: ${port}`
        )
      }
    )
  }

  if (config.redirector.enabled) {
    servers.redirector = createRedirectorServer({ logger })

    const listener = servers.redirector.listen(
      config.redirector?.serverPort ?? DEFAULT_REDIRECTOR_PORT,
      config.redirector?.serverHostname ?? LOCALHOST,
      () => {
        const { address, port } = listener.address()
        return logger.info(
          `Перенаправляющий сервер запущен -> адрес: ${address}, порт: ${port}`
        )
      }
    )
  }

  if (config.socks.enabled) {
    servers.socks = createSocksServer({ logger, servers })

    const listener = servers.socks.listen(
      config.socks?.serverPort ?? DEFAULT_SOCKS5_PORT,
      config.socks?.serverHostname ?? LOCALHOST,
      () => {
        const { address, port } = listener.address()
        return logger.info(
          `SOCKS сервер запущен -> адрес: ${address}, порт: ${port}`
        )
      }
    )
  }
}

main()
