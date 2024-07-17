/**
 * @file Главный скрипт сервера образов
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const http = require('node:http')
const path = require('node:path')
const { processAvatar } = require('./processor')
const config = require('../../../config')

const ALLOWED_HOSTS = config?.obraz?.customHost
  ? [config.obraz.customHost, 'foto.obraz.mail.ru']
  : ['foto.obraz.mail.ru']
const ALLOWED_DOMAINS = ['mail.ru', 'internet.ru', 'bk.ru']
const PLACEHOLDER_FILE =
  path.join(__dirname, '../../../ugc/avatars/mdp.jpg')

const server = http.createServer(requestListener)

/**
 * @param {http.IncomingMessage} request Запрос от клиента
 * @param {http.ServerResponse} response Ответ от сервера
 */
function requestListener (request, response) {
  if (!ALLOWED_HOSTS.includes(request.headers.host)) {
    response.statusCode = 418
    return response.end("I'm a teapot")
  }

  const path = request.url.substring(1)

  if (path.split('/').length !== 3) {
    response.statusCode = 404
    return response.end('Not Found')
  }

  // eslint-disable-next-line no-unused-vars
  const [domain, _login, avatarType] = path.split('/')

  if (!ALLOWED_DOMAINS.includes(domain)) {
    response.statusCode = 400
    return response.end('Bad Request')
  }

  response.setHeader('Content-Type', 'image/jpeg')

  processAvatar(PLACEHOLDER_FILE, avatarType)
    .then(function onAvatar (avatar) {
      return response.end(avatar)
    }, function onError () {
      return response.end()
    })
}

module.exports = server
