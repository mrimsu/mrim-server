/**
 * @file Реализация класса для создания TCP-сервера.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const net = require('node:net')

const DEFAULT_TCP_HOST = 'localhost'
const DEFAULT_TCP_PORT = 5000

class TCPServer {
  constructor (options) {
    this.host = options.host ?? DEFAULT_TCP_HOST
    this.port = options.port ?? DEFAULT_TCP_PORT

    if (options.logger === undefined) {
      throw new Error('Логгер необходим для TCP сервера')
    }

    this.logger = options.logger
  }

  /**
   * Обработчик подключения клиентом
   * @param {net.Socket} socket Сокет подключенного клиента
   */
  onConnection (socket) {
    throw new Error('TCPServer.$onConnection не реализован')
  }

  /**
   * Включение прослушивания порта сервером
   * @param {CallableFunction} callback Callback успешного прослушивания порта сервером
   * @returns Прослушиватель порта
   */
  listen (callback) {
    const onConnection = this.onConnection.bind(this)

    return net.createServer(onConnection)
      .listen(this.port, this.host, callback)
  }
}

module.exports = TCPServer
