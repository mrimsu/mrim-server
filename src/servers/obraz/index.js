/**
 * @file Главный скрипт сервера образов
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const http = require('node:http')
const { processAvatar } = require('./processor')
const { getUserAvatar } = require('../../database')
const config = require('../../../config')

const ALLOWED_HOSTS = config?.obraz?.customHost
  ? [config.obraz.customHost, 'obraz.foto.mail.ru']
  : ['obraz.foto.mail.ru']
const ALLOWED_DOMAINS = ['mail.ru', 'internet.ru', 'bk.ru']

const server = http.createServer(requestListener)

/**
 * @param {http.IncomingMessage} request Запрос от клиента
 * @param {http.ServerResponse} response Ответ от сервера
 */
async function requestListener (request, response) {
  if (!ALLOWED_HOSTS.includes(request.headers.host)) {
    response.statusCode = 418
    return response.end("I'm a teapot")
  }

  const path = request.url.substring(1)

  if (path.split('/').length !== 3) {
    response.statusCode = 404
    return response.end('Not Found')
  }

  const [domain, userLogin, avatarType] = path.split('/')

  if (!ALLOWED_DOMAINS.includes(domain)) {
    response.statusCode = 400
    return response.end('Bad Request')
  }

  response.setHeader('Content-Type', 'image/jpeg')

  let avatarPath

  try {
    avatarPath = await getUserAvatar(userLogin)
  } catch {
    response.statusCode = 404
    response.setHeader('X-NoImage', '1')

    return response.end()
  }

  try {
    const avatar = await processAvatar(avatarPath, avatarType)

    response.statusCode = 200
    response.write(avatar)

    return response.end()
  } catch {
    response.statusCode = 500
    response.setHeader('X-NoImage', '1')

    return response.end()
  }
}

module.exports = server
