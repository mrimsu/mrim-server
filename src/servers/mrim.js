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

    const onData = this.onData(socket)
    const onError = this.onError.bind(this)

    socket.on('data', onData)
    socket.on('error', onError)
  }

  onData (socket) {
    const { address, port } = socket.address()

    const implementation = (data) => {
      this.logger.info(`Клиент ${address}:${port} отправил "${data}"`)
      socket.write(data)
    }

    return implementation
  }

  onError (error) {
    this.logger.error(error.stack)
  }
}

module.exports = MRIMServer
