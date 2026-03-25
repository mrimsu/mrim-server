/**
 * @file Главный скрипт сервера образов
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

// eslint-disable-next-line no-unused-vars
const { Socket, createServer } = require('node:net')
const { processAvatar } = require('./processor')
const { getUserAvatar } = require('../../database')
const config = require('../../../config')
const { query } = require('winston')
const { generateXMLResponse } = require('./weather')

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
      responseBody = Buffer.from(responseBody, 'utf8')
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

    try {
      return socket.end(responseMessage)
    } catch (e) {
      console.log(
        `[obraz] internal error, stack: ${e.stack}`
      )
    }
  }

  /**
   * Обработка запроса
   * 
   * @param {Object} request Данные запроса
   */
  async function requestListener ({ method, pathname, version, headers }) {
    try {
      if (!ALLOWED_METHODS.includes(method)) {
        return respond(version, 418, "I'm a teapot")
      }

      if (pathname.startsWith('http')) {
        pathname = new URL(pathname).pathname
      }
      pathname = pathname.substring(1)
      let [uripath, queryValue] = pathname.split('?')
      let queryValues = {}

      if (queryValue !== undefined) {
        queryValue.split('&').forEach(element => {
          const [key, value] = element.split('=')
          queryValues[key] = value
        });
      }

      console.log(
          `[obraz] dbg ${pathname}`
      )

      /* special inform handlers */
      if (uripath === '/popup.html' || uripath === 'popup.html') {
        return respond(version, 200, '<html><body>hello stranger</body></html>')
      }

      if (uripath === "inf/magent_main.xml") {
        if (queryValues['city'] !== undefined) {
          const xmlResponse = await generateXMLResponse(queryValues['city'])
          if (xmlResponse !== null) {
            return respond(version, 200, xmlResponse)
          } else {
            return respond(version, 500, 'Internal Server Error')
          }
        }
      }

      if (uripath.split('/').length !== 3) {
        return respond(version, 404, 'Not Found')
      } else {
        return await processObraz({method, uripath, version})
      }

      // processing pfp by default

    } catch (e) {
      console.log(
        `[obraz] internal error, stack: ${e.stack}`
      )
    }
  }

  /**
   * Обработка запроса
   * 
   * @param {Object} request Данные запроса
   */
  async function processObraz ({ method, uripath, version }) {
    let [domain, userLogin, avatarType] = uripath.split('/')

    let avatarPath

    try {
      if (userLogin === config.adminProfile?.username && config.adminProfile?.domain.startsWith(domain) &&
        config.adminProfile?.avatarUrl !== null) {
        avatarPath = config.adminProfile.avatarUrl
      } else {
        avatarPath = await getUserAvatar(userLogin, domain)
      }
    } catch {
      return respond(version, 404, null, {
        Date: new Date().toUTCString(),
        'Content-Type': 'image/jpeg',
        'Content-Length': '0',
        'X-NoImage': '1'
      })
    }

    console.log(
        `[obraz] got avatar path for ${userLogin}: ${avatarPath}`
    )

    if (avatarPath === undefined) {
      return respond(version, 404, null, { Date: new Date().toUTCString(), 'Content-Type': 'image/jpeg', 'X-NoImage': '1' })
    }

    try {
      const avatar = await processAvatar((config.obraz.cdnPath ?? '') + avatarPath, avatarType)

      return respond(version, 200, method !== 'HEAD' ? avatar : null, {
        Date: new Date().toUTCString(),
        'Content-Type': 'image/jpeg',
        'Content-Length': avatar.length,
        'Cache-Control': 'max-age=604800',
        'Last-Modified': new Date().toUTCString(),
        Expires: new Date(Date.now() + 604_800_000).toUTCString()
      })
    } catch (e) {
      console.log(
        `[obraz] internal error for ${userLogin}, path: ${(config.obraz.cdnPath ?? '') + avatarPath}, stack: ${e.stack}`
      )
      return respond(version, 500, null, { Date: new Date().toUTCString(), 'Content-Type': 'image/jpeg', 'X-NoImage': '1' })
    }
  }
}

module.exports = server
