/**
 * @file Главный скрипт проекта.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const arg = require('arg')
const winston = require('winston')

const MIRMServer = require('./servers/mirm')
const SocksServer = require('./servers/socks')

const DEFAULT_MIRM_PORT = 2402
const DEFAULT_SOCKS5_PORT = 8080

function main () {
  const args = arg({ '--mirm-port': Number, '--socks-port': Number, '--log-level': String })

  const logger = winston.createLogger({
    level: args['--log-level'] ?? 'info',
    format: winston.format.cli(),
    transports: [new winston.transports.Console()]
  })

  const mirmServer = new MIRMServer({
    host: 'localhost',
    port: args['--mirm-port'] ?? DEFAULT_MIRM_PORT,
    logger
  })

  const socksServer = new SocksServer({
    host: 'localhost',
    port: args['--socks-port'] ?? DEFAULT_SOCKS5_PORT,
    mirm: mirmServer,
    logger
  })

  const mirmListener = mirmServer.listen(() => {
    const { address, port } = mirmListener.address()
    return logger.info(`MIRM сервер запущен -> адрес: ${address}, порт: ${port}`)
  })

  const socksListener = socksServer.listen(() => {
    const { address, port } = socksListener.address()
    return logger.info(`SOCKS5 прокси-сервер запущен -> адрес: ${address}, порт: ${port}`)
  })
}

main()
