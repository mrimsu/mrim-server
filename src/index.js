/**
 * @file Главный скрипт пакета
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const config = require('../config')
const winston = require('winston')

const createRedirectorServer = require('./servers/redirector')
const createSocksServer = require('./servers/socks')
const createMrimServer = require('./servers/mrim')

const obrazServer = require('./servers/obraz')
const RESTserver = require('./servers/rest')

const DEFAULT_MRIM_PORT = 2041
const DEFAULT_REDIRECTOR_PORT = 2042
const DEFAULT_SOCKS5_PORT = 8080
const DEFAULT_OBRAZ_PORT = 8081
const DEFAULT_REST_PORT = 1862

const LOCALHOST = 'localhost' // пиздец

function main () {
  const logger = winston.createLogger({
    level: config.logger?.level ?? 'debug',
    format: winston.format.cli(),
    transports: [new winston.transports.Console()]
  })

  process.on('uncaughtException', err => {
    logger.error('uncaught exception:', err)
  })

  process.on('unhandledRejection', err => {
    logger.error('unhandled rejection:', err)
  })

  const servers = {}

  if (
    !config.mrim.enabled &&
    !config.redirector.enabled &&
    !config.socks.enabled &&
    !config.obraz.enabled
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
          `MRIM server started -> address: ${address}, port: ${port}`
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
          `balancer (redirector) server started -> address: ${address}, port: ${port}`
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
          `SOCKS server started -> address: ${address}, port: ${port}`
        )
      }
    )
  }

  if (config.obraz.enabled) {
    servers.obraz = obrazServer

    const listener = servers.obraz.listen(
      config.obraz?.serverPort ?? DEFAULT_OBRAZ_PORT,
      config.obraz?.serverHostname ?? LOCALHOST,
      () => {
        const { address, port } = listener.address()
        return logger.info(
          `avatars (obraz) server started -> address: ${address}, port: ${port}`
        )
      }
    )
  }

  if (config.rest?.enabled) {
    servers.rest = RESTserver

    const listener = servers.rest.listen(
      config.rest?.serverPort ?? DEFAULT_REST_PORT,
      config.rest?.serverHostname ?? LOCALHOST,
      () => {
        const { address, port } = listener.address()
        return logger.info(
          `REST API started -> address: ${address}, port: ${port}`
        )
      }
    )
  }
}

main()
