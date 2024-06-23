/**
 * @file Главный скрипт проекта.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const arg = require('arg')
const winston = require('winston')

const MRIMServer = require('./servers/mrim')
const TransferServer = require('./servers/transfer')
const SocksServer = require('./servers/socks')

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

  const mrimServer = new MRIMServer({
    host: 'localhost',
    port: args['--mrim-port'] ?? DEFAULT_MRIM_PORT,
    logger
  })

  const transferServer = new TransferServer({
    host: 'localhost',
    port: args['--mrim-transfer-port'] ?? DEFAULT_TRANSFER_PORT,
    logger
  })

  const socksServer = new SocksServer({
    host: 'localhost',
    port: args['--socks-port'] ?? DEFAULT_SOCKS5_PORT,
    servers: {
      mrim: mrimServer,
      transfer: transferServer
    },
    logger
  })

  const transferListener = transferServer.listen(() => {
    const { address, port } = transferListener.address()
    return logger.info(
      `перенаправляющий сервер запущен -> адрес: ${address}, порт: ${port}`
    )
  })

  const mrimListener = mrimServer.listen(() => {
    const { address, port } = mrimListener.address()
    return logger.info(
      `MRIM сервер запущен -> адрес: ${address}, порт: ${port}`
    )
  })

  const socksListener = socksServer.listen(() => {
    const { address, port } = socksListener.address()
    return logger.info(
      `SOCKS5 прокси-сервер запущен -> адрес: ${address}, порт: ${port}`
    )
  })
}

main()
