/**
 * @file Реализация конструктора сервера
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const net = require('node:net')
const crypto = require('node:crypto')

/**
 * Тип обработчика сообщений
 *
 * @enum {number}
 * @readonly
 */
const ServerMessageHandler = {
  SINGLE: 1, // NOTE обработчик сообщений может быть одиноким, как и я
  STEP_BY_STEP: 2
}

class ServerConstructor {
  constructor (options) {
    if (options.logger === undefined) {
      throw new Error('необходим логгер')
    }
    this.logger = options.logger

    this.handlerType = options.handlerType ?? ServerMessageHandler.SINGLE
    if (
      this.handlerType === ServerMessageHandler.SINGLE &&
      options.onConnection === undefined
    ) {
      throw new Error('необходим реализация обработчика сообщений')
    }
    this.onConnection = this.generateConnectionHandler(options.onConnection)

    this.steps = []
    this.variables = options.variables ?? {}
  }

  /**
   * Добавить шаг в обработчик сообщений
   *
   * @param {CallableFunction} handler Обработчик шага
   * @returns {ServerConstructor} Возвращает себя
   */
  step (handler) {
    if (this.handlerType !== ServerMessageHandler.STEP_BY_STEP) {
      throw new Error('тип обработчика сообщений - одинокий')
    }

    this.steps.push(handler)
    this.onConnection = this.generateConnectionHandler()

    return this
  }

  // TODO mikhail переписать нахуй
  handlerWrapperGenerator (socket, handler, stepIndex, connectionId) {
    const wrapped = (data) => {
      try {
        const result = handler({
          socket,
          data,
          logger: this.logger,
          variables: this.variables,
          connectionId
        })

        if (result.reply === null || result.reply === undefined) {
          return
        }

        if (result.end === true) {
          socket.end(result.reply)
        } else {
          socket.write(result.reply)
        }

        if (result.afterHandler !== undefined) {
          result.afterHandler()
        }

        const nextHandlerIndex = stepIndex + 1
        const nextHandler =
          nextHandlerIndex !== this.steps.length
            ? this.steps[nextHandlerIndex]
            : null

        socket.removeListener('data', wrapped)

        if (nextHandler === null) {
          return
        }

        socket.on(
          'data',
          this.handlerWrapperGenerator(socket, nextHandler, nextHandlerIndex)
        )
      } catch (error) {
        this.logger.error(error.stack)

        if (error.reply === null || error.reply === undefined) {
          return
        }

        if (error.end === true) {
          socket.end(error.reply)
        } else {
          socket.write(error.reply)
        }
      }
    }

    return wrapped
  }

  generateConnectionHandler (onConnection) {
    return (socket) => {
      const connectionId = crypto.randomBytes(4).toString('hex')
      this.logger.info(`Новое подключение -> ид подключения: ${connectionId}`)

      switch (this.handlerType) {
        case ServerMessageHandler.SINGLE:
          onConnection(socket, connectionId, this.logger, this.variables)
          break
        case ServerMessageHandler.STEP_BY_STEP:
          socket.on(
            'data',
            this.handlerWrapperGenerator(
              socket,
              this.steps[0],
              0,
              connectionId
            )
          )
          break
      }

      socket.on('error', (error) =>
        this.logger.error(`[${connectionId}] Произошла ошибка: ${error.stack}`)
      )
    }
  }

  /**
   * Закончить TCP-сервер
   * @returns {net.Server} Финальный TCP-сервер
   */
  finish () {
    // TODO mikhail КОСТЫЛЬ WARNING
    const server = net.createServer(this.onConnection)
    server.onConnection = this.onConnection

    return server
  }
}

module.exports = { ServerConstructor, ServerMessageHandler }
