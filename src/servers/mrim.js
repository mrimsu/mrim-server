/**
 * @file Реализация сервера с протоколом MRIM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const TCPServer = require('./tcp')

// TODO mikhail начать реализовывать протокол MRIM
class MRIMServer extends TCPServer {
  onConnection (socket) {
    socket.setEncoding('ascii')

    const { address, port } = socket.address()
    this.logger.info(`Клиент ${address}:${port} подключился к MRIM серверу`)

    socket.on('data', (data) => {
      this.logger.info(`Клиент ${address}:${port} отправил "${data}"`)
      socket.write(data)
    })

    socket.on('error', (error) => {
      this.logger.error(error.stack)
      socket.end(error.stack)
    })
  }
}

module.exports = MRIMServer
