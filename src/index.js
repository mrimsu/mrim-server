/**
 * @file Главный скрипт проекта.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const MIRMServer = require('./servers/mirm')

const mirmServer = new MIRMServer('localhost', 5000)
mirmServer.listen(() => console.log('MIRM сервер запущено -> порт: 5000'))
