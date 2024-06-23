/**
 * @file Главный скрипт проекта.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const MIRMServer = require('./servers/mirm')
const SocksServer = require('./servers/socks')

const mirmServer = new MIRMServer({ host: 'localhost', port: 2402 })
mirmServer.listen(() => console.log('MIRM сервер запущено -> порт: 2402'))

const socksServer = new SocksServer({ host: 'localhost', port: 8080, mirm: mirmServer })
socksServer.listen(() => console.log('SOCKS5 прокси-сервер запущено -> порт: 8080'))
