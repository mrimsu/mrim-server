/**
 * @file Главный скрипт проекта.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const arg = require('arg')
const winston = require('winston')

const MRIMServer = require('./servers/mrim')
const SocksServer = require('./servers/socks')

const DEFAULT_MRIM_PORT = 2042
const DEFAULT_SOCKS5_PORT = 8080

function main () {
  const args = arg({ '--MRIM-port': Number, '--socks-port': Number, '--log-level': String })

  const logger = winston.createLogger({
    level: args['--log-level'] ?? 'info',
    format: winston.format.cli(),
    transports: [new winston.transports.Console()]
  })

  const mrimServer = new MRIMServer({
    host: 'localhost',
    port: args['--MRIM-port'] ?? DEFAULT_MRIM_PORT,
    logger
  })

  const socksServer = new SocksServer({
    host: 'localhost',
    port: args['--socks-port'] ?? DEFAULT_SOCKS5_PORT,
    mrim: mrimServer,
    logger
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
