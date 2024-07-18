/**
 * @file Главный скрипт сервера образов
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

// eslint-disable-next-line no-unused-vars
const { Socket, createServer } = require('node:net')
const { processAvatar } = require('./processor')
const { getUserAvatar } = require('../../database')
const config = require('../../../config')

const ALLOWED_HOSTS = config?.obraz?.customHost
  ? [config.obraz.customHost, 'obraz.foto.mail.ru']
  : ['obraz.foto.mail.ru']
const ALLOWED_DOMAINS = ['mail', 'internet', 'bk', 'corp.mail']
const ALLOWED_METHODS = ['GET', 'HEAD']
const STATUS_CODES = {
  200: 'OK',
  400: 'Bad Request',
  404: 'Not Found',
  418: "I'm a teapot",
  500: 'Internal Server Error'
}

const server = createServer(connectionListener)

/**
 * @param {Socket} socket Сокет подключения
 */
function connectionListener (socket) {
  socket.on('data', parse)

  /**
   * @param {Buffer} data Данные запроса
   */
  function parse (data) {
    data = data
      .toString('ascii')
      .split('\r\n')
      .filter((line) => line.length !== 0)

    const [method, pathname, version] = data[0].split(' ')
    const headers = Object.fromEntries(
      data.slice(1).map((header) => header.split(': '))
    )

    return requestListener({ method, pathname, version, headers })
  }

  /**
   * Ответить на HTTP-запрос
   *
   * @param {string} httpVersion Версия HTTP-протокола
   * @param {number} statusCode Статус-код
   * @param {string | Buffer | null} responseBody Данные ответа
   * @param {object | null} responseHeaders Заголовки ответа
   */
  function respond (httpVersion, statusCode, responseBody, responseHeaders) {
    if (typeof responseBody === 'string') {
      responseBody = Buffer.from(responseBody, 'ascii')
    }

    if (responseHeaders === null || responseHeaders === undefined) {
      responseHeaders = {}
    }

    responseHeaders.Server = 'mrim-server'

    if (responseBody !== null && !Object.keys(responseHeaders).includes('Content-Length')) {
      responseHeaders['Content-Length'] = responseBody.length
    }

    responseHeaders = Object.entries(responseHeaders)
      .map(([headerField, headerValue]) => `${headerField}: ${headerValue}\r\n`)
      .join('')

    let responseMessage = Buffer.from(
      `${httpVersion} ${statusCode} ${STATUS_CODES[statusCode] ?? ''}\r\n${responseHeaders}\r\n`,
      'ascii'
    )

    if (responseBody !== null) {
      responseMessage = Buffer.concat([responseMessage, responseBody])
    }

    return socket.end(responseMessage)
  }

  /**
   * @param {Object} request Данные запроса
   */
  async function requestListener ({ method, pathname, version, headers }) {
    if (!ALLOWED_HOSTS.includes(headers?.Host) || !ALLOWED_METHODS.includes(method)) {
      return respond(version, 418, "I'm a teapot")
    }

    if (pathname.startsWith('http')) {
      pathname = new URL(pathname).pathname
    }
    pathname = pathname.substring(1)

    if (pathname.split('/').length !== 3) {
      return respond(version, 404, 'Not Found')
    }

    const [domain, userLogin, avatarType] = pathname.split('/')

    if (!ALLOWED_DOMAINS.includes(domain)) {
      return respond(version, 400, 'Bad Request')
    }

    let avatarPath

    try {
      avatarPath = await getUserAvatar(userLogin)
    } catch {
      return respond(version, 404, null, {
        Date: new Date().toUTCString(),
        'Content-Type': 'image/jpeg',
        'Content-Length': '0',
        'X-NoImage': '1'
      })
    }

    try {
      const avatar = await processAvatar(avatarPath, avatarType)

      return respond(version, 200, method !== 'HEAD' ? avatar : null, {
        Date: new Date().toUTCString(),
        'Content-Type': 'image/jpeg',
        'Content-Length': avatar.length,
        'Cache-Control': 'max-age=604800',
        'Last-Modified': new Date().toUTCString(),
        Expires: new Date(Date.now() + 604_800_000).toUTCString()
      })
    } catch {
      return respond(version, 500, null, { Date: new Date().toUTCString(), 'Content-Type': 'image/jpeg', 'X-NoImage': '1' })
    }
  }
}

module.exports = server
