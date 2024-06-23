/**
 * @file Мини-сервер для выдачи IP адреса и порта сервера.
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const TCPServer = require('./tcp')

class TransferServer extends TCPServer {
  onConnection (socket) {
    const { address, port } = socket.address()
    this.logger.info(
      `Клиент ${address}:${port} подключился к перенаправлятору`
    )

    socket.end('127.0.0.1:2041') // TODO: сделать отправку внешнего IP
    this.logger.info(`Клиенту ${address}:${port} отправлен айпи, отключаемся`)
  }
}

module.exports = TransferServer
