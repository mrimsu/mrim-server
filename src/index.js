/**
 * @file Главный скрипт проекта.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const arg = require('arg')
const winston = require('winston')

const MRIMServer = require('./servers/mrim')
const MRIMTransferServer = require('./servers/mrimtrans')
const SocksServer = require('./servers/socks')

const DEFAULT_MRIMTRANSFER_PORT = 2042
const DEFAULT_MRIM_PORT = 2041
const DEFAULT_SOCKS5_PORT = 8080

function main () {
  const args = arg({ '--mrim-port': Number, '--socks-port': Number, '--log-level': String })

  const logger = winston.createLogger({
    level: args['--log-level'] ?? 'info',
    format: winston.format.cli(),
    transports: [new winston.transports.Console()]
  })

  const mrimServer = new MRIMServer({
    host: 'localhost',
    port: args['--mrim-port'] ?? DEFAULT_MRIM_PORT,
    logger
  })
  
  const mrimTransferServer = new MRIMTransferServer({
    host: 'localhost',
    port: args['--mrimtransfer-port'] ?? DEFAULT_MRIMTRANSFER_PORT,
    logger
  })

  const socksServer = new SocksServer({
    host: 'localhost',
    port: args['--socks-port'] ?? DEFAULT_SOCKS5_PORT,
    mrim: mrimServer,
    mrimtransfer: mrimTransferServer,
    logger
  })

  const mrimTransferListener = mrimTransferServer.listen(() => {
    const { address, port } = mrimTransferListener.address()
    return logger.info(`Перенаправляющий сервер запущен -> адрес: ${address}, порт: ${port}`)
  })

  const mrimListener = mrimServer.listen(() => {
    const { address, port } = mrimListener.address()
    return logger.info(`MRIM сервер запущен -> адрес: ${address}, порт: ${port}`)
  })

  const socksListener = socksServer.listen(() => {
    const { address, port } = socksListener.address()
    return logger.info(`SOCKS5 прокси-сервер запущен -> адрес: ${address}, порт: ${port}`)
  })
}

main()
