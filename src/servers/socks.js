/**
 * @file Реализация SOCKS5 проски-сервера
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const {
  ServerConstructor,
  ServerMessageHandler
} = require('../constructors/server')
const {
  ClientHandshakeMessage,
  ServerHandshakeMessage
} = require('../messages/socks/handshake')
const {
  ClientConnectionMessage,
  ServerConnectionMessage
} = require('../messages/socks/connection')

const SocksAuthenticationMethods = { ANONYMOUS: 0x00, NOT_ACCEPTABLE: 0xff }
const SocksConnectionStatus = {
  SUCCESS: 0x00,
  CONNECTION_NOT_ALLOWED: 0x02,
  COMMAND_NOT_SUPPORTED: 0x07
}

const SOCKS_COMMAND_CONNECT = 0x01

const MRIM_SERVER_PORT = 2041
const REDIRECTOR_SERVER_PORT = 2042

function handleHandshakeRequest ({ data, logger, connectionId }) {
  const message = ClientHandshakeMessage.reader(data)

  const clientSupportsAnonymousAccess = message.authenticationMethods.includes(
    SocksAuthenticationMethods.ANONYMOUS
  )

  if (clientSupportsAnonymousAccess) {
    return {
      reply: ServerHandshakeMessage.writer({
        authenticationMethod: SocksAuthenticationMethods.ANONYMOUS
      })
    }
  }

  logger.error(
    `[${connectionId}] Клиент не поддерживает анонимное подключение`
  )

  return {
    reply: ServerHandshakeMessage.writer({
      authenticationMethod: SocksAuthenticationMethods.NOT_ACCEPTABLE
    }),
    end: true
  }
}

function handleConnectionRequest ({
  socket,
  data,
  logger,
  connectionId,
  variables
}) {
  const message = ClientConnectionMessage.reader(data)

  if (message.connectionCommand !== SOCKS_COMMAND_CONNECT) {
    logger.error(
      `[${connectionId}] Клиент отправил не поддерживаемую команду -> код команды: ${message.connectionCommand}`
    )

    return {
      reply: ServerConnectionMessage.writer({
        ...message,
        connectionStatus: SocksConnectionStatus.COMMAND_NOT_SUPPORTED,
        connectionCommand: undefined
      }),
      end: true
    }
  }

  if (
    message.destinationPort !== MRIM_SERVER_PORT &&
    message.destinationPort !== REDIRECTOR_SERVER_PORT
  ) {
    logger.error(
      `[${connectionId}] Клиент хочет подключиться не к MRIM/перенаправлятору -> адрес: ${message.destinationAddress}, порт: ${message.destinationPort}`
    )

    return {
      reply: ServerConnectionMessage.writer({
        ...message,
        connectionStatus: SocksConnectionStatus.CONNECTION_NOT_ALLOWED,
        connectionCommand: undefined
      }),
      end: true
    }
  }

  return {
    reply: ServerConnectionMessage.writer({
      ...message,
      connectionStatus: SocksConnectionStatus.SUCCESS,
      connectionCommand: undefined
    }),
    afterHandler: () => {
      switch (message.destinationPort) {
        case MRIM_SERVER_PORT:
          return variables.servers.mrim.onConnection(socket)
        case REDIRECTOR_SERVER_PORT:
          return variables.servers.redirector.onConnection(socket)
      }
    }
  }
}

function createSocksServer (options) {
  if (options.servers.mrim === undefined) {
    throw new Error('Необходим MRIM сервер')
  }

  if (options.servers.redirector === undefined) {
    throw new Error('Необходим перенаправляющий сервер')
  }

  return new ServerConstructor({
    logger: options.logger,
    handlerType: ServerMessageHandler.STEP_BY_STEP,
    variables: { servers: options.servers }
  })
    .step(handleHandshakeRequest)
    .step(handleConnectionRequest)
    .finish()
}

module.exports = createSocksServer
