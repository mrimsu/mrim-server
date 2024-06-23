/**
 * @file Реализация класса для создания TCP-сервера.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const net = require('node:net')

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5000

class TCPServer {
  constructor (host, port) {
    this.host = host ?? DEFAULT_HOST
    this.port = port ?? DEFAULT_PORT
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
