/**
 * @file Реализация сервера с протоколом MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const TCPServer = require('./tcp')

// TODO mikhail начать реализовывать протокол MIRM
class MIRMServer extends TCPServer {
  onConnection (socket) {
    socket.setEncoding('ascii')

    const { address, port } = socket.address()
    this.logger.info(`Клиент ${address}:${port} подключился к MIRM серверу`)

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

module.exports = MIRMServer
