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

  const mrimServer = createMrimServer({
    logger
  })

  const redirectorServer = createRedirectorServer({ logger })

  const socksServer = createSocksServer({
    servers: {
      mrim: mrimServer,
      redirector: redirectorServer
    },
    logger
  })

  const mrimListener = mrimServer.listen(
    config.mrim?.serverPort ?? DEFAULT_MRIM_PORT,
    config.mrim?.serverHostname ?? LOCALHOST,
    () => {
      const { address, port } = mrimListener.address()
      return logger.info(
        `MRIM сервер запущен -> адрес: ${address}, порт: ${port}`
      )
    }
  )

  const redirectorListener = redirectorServer.listen(
    config.redirector?.serverPort ?? DEFAULT_REDIRECTOR_PORT,
    config.redirector?.serverHostname ?? LOCALHOST,
    () => {
      const { address, port } = redirectorListener.address()
      return logger.info(
        `перенаправляющий сервер запущен -> адрес: ${address}, порт: ${port}`
      )
    }
  )

  const socksListener = socksServer.listen(
    config.socks?.serverPort ?? DEFAULT_SOCKS5_PORT,
    config.socks?.serverHostname ?? LOCALHOST,
    () => {
      const { address, port } = socksListener.address()
      return logger.info(
        `SOCKS5 прокси-сервер запущен -> адрес: ${address}, порт: ${port}`
      )
    }
  )
}

main()
