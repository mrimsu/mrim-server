/**
 * @file Реализация сервера с протоколом MIRM.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const TCPServer = require('./tcp')

// TODO mikhail начать реализовывать протокол MIRM
class MIRMServer extends TCPServer {
  onConnection (socket) {
    socket.setEncoding('ascii')

    socket.on('data', (data) => socket.write(data))
    socket.on('error', (error) => console.error(error))
  }
}

module.exports = MIRMServer
