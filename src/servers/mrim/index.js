/**
 * @file Главный скрипт MRIM-сервера
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { ServerConstructor } = require('../../constructors/server')
const onConnection = require('./implementation')

/* 
  Временный костыль (а может и нет?), так как пихать переменную
  в функцию или в класс, чтобы он ещё и был одинаковым во всех
  инстанциях невозможно. Так что придётся делать так.
*/
global.clients = [];

function createMrimServer (options) {
  return new ServerConstructor({
    logger: options.logger,
    variables: { clients: [] }, // Не использовать
    onConnection
  }).finish()
}

module.exports = createMrimServer
