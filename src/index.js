/**
 * @file Главный скрипт пакета
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const arg = require('arg')
const winston = require('winston')

const createRedirectorServer = require('./servers/redirector')
const createSocksServer = require('./servers/socks')
const createMrimServer = require('./servers/mrim')

const DEFAULT_TRANSFER_PORT = 2042
const DEFAULT_MRIM_PORT = 2041
const DEFAULT_SOCKS5_PORT = 8080

function main () {
  const args = arg({
    '--mrim-port': Number,
    '--mrim-transfer-port': Number,
    '--socks-port': Number,
    '--log-level': String
  })

  const logger = winston.createLogger({
    level: args['--log-level'] ?? 'debug',
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

  const redirectorListener = redirectorServer.listen(
    args['--mrim-transfer-port'] ?? DEFAULT_TRANSFER_PORT,
    '0.0.0.0',
    () => {
      const { address, port } = redirectorListener.address()
      return logger.info(
        `перенаправляющий сервер запущен -> адрес: ${address}, порт: ${port}`
      )
    }
  )

  const mrimListener = mrimServer.listen(
    args['--mrim-port'] ?? DEFAULT_MRIM_PORT,
    '0.0.0.0',
    () => {
      const { address, port } = mrimListener.address()
      return logger.info(
        `MRIM сервер запущен -> адрес: ${address}, порт: ${port}`
      )
    }
  )

  const socksListener = socksServer.listen(
    args['--socks-port'] ?? DEFAULT_SOCKS5_PORT,
    '0.0.0.0',
    () => {
      const { address, port } = socksListener.address()
      return logger.info(
        `SOCKS5 прокси-сервер запущен -> адрес: ${address}, порт: ${port}`
      )
    }
  )
}

main()
