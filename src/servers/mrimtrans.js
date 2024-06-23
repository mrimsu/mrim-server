/**
 * @file Мини-сервер для выдачи IP адреса и порта сервера.
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const TCPServer = require('./tcp')

class MRIMTransferServer extends TCPServer {
  onConnection (socket) {
    const { address, port } = socket.address()
    this.logger.info(`Клиент ${address}:${port} подключился к перенаправлятору`);

    const onError = this.onError.bind(this);

    socket.on('error', onError);

    socket.write('127.0.0.1:2041'); // TODO: сделать отправку внешнего IP
    socket.destroy();
    this.logger.info(`Клиенту ${address}:${port} отправлен айпи, отключаемся`);
  }

  onError (error) {
    this.logger.error(error.stack)
  }
}

module.exports = MRIMTransferServer