/**
 * @file Обработка анкет
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 * @author Neru Asano <neru.asano9667@gmail.com>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { MrimMessageCommands } = require('../globals')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const { MrimSearchField, MrimAnketaHeader } = require('../../../messages/mrim/search')
const { searchUsers } = require('../../../database')
const { getZodiacId } = require('../../../tools/zodiac')
const { _checkIfLoggedIn } = require('./core')
const { Iconv } = require('iconv')

const MrimSearchRequestFields = {
  USER: 0,
  DOMAIN: 1,
  NICKNAME: 2,
  FIRSTNAME: 3,
  LASTNAME: 4,
  SEX: 5,
  DATE_MIN: 7,
  DATE_MAX: 8,
  CITY_ID: 11,
  ZODIAC: 12,
  BIRTHDAY_MONTH: 13,
  BIRTHDAY_DAY: 14,
  COUNTRY_ID: 15,
  ONLINE: 9
}

const AnketaInfoStatus = {
  NOUSER: 0,
  OK: 1,
  DBERR: 2,
  RATELIMITER: 3
}

async function processSearch (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state
) {
  if (await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  if (!state.searchRateLimiter) {
    state.searchRateLimiter = {
      available: 25,
      refreshTime: Date.now() + 15 * 60 * 60
    }
  }

  if (Date.now() > state.searchRateLimiter.refreshTime) {
    state.searchRateLimiter.available = 25
  }

  if (state.searchRateLimiter.available < 1) {
    return {
      reply: new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.ANKETA_INFO,
            dataSize: 0x4
          })
        )
        .integer(AnketaInfoStatus.RATELIMITER, 4)
        .finish()
    }
  }

  const packetFields = {}

  while (packetData.length >= 4) {
    try {
      const field = MrimSearchField.reader(packetData, false)
      packetFields[field.key] = field.value

      // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
      const offset = MrimSearchField.writer(field).length
      packetData = packetData.subarray(offset)
    } catch (e) {
      // вылезает OOB если неправильно сформирован запрос или закончились строки, скипаем
      break
    }
  }

  logger.debug(`[${connectionId}] ${state.username}@${state.domain} tried to search smth...`)
  logger.debug(
    `[${connectionId}] packetFields -> ${JSON.stringify(packetFields)}`
  )

  const searchParameters = {}

  for (let [key, value] of Object.entries(packetFields)) {
    key = parseInt(key, 10)

    switch (key) {
      case MrimSearchRequestFields.USER:
        searchParameters.login = value
        break
      case MrimSearchRequestFields.DOMAIN:
        searchParameters.domain = value
        break
      case MrimSearchRequestFields.NICKNAME:
        searchParameters.nickname = new Iconv(state.utf16capable ? 'UTF-16LE' : 'CP1251', 'UTF-8').convert(value.toString()).toString()
        break
      case MrimSearchRequestFields.FIRSTNAME:
        searchParameters.firstName = new Iconv(state.utf16capable ? 'UTF-16LE' : 'CP1251', 'UTF-8').convert(value.toString()).toString()
        break
      case MrimSearchRequestFields.LASTNAME:
        searchParameters.lastName = new Iconv(state.utf16capable ? 'UTF-16LE' : 'CP1251', 'UTF-8').convert(value.toString()).toString()
        break
      case MrimSearchRequestFields.DATE_MIN:
        searchParameters.minimumAge = parseInt(value, 10)
        break
      case MrimSearchRequestFields.DATE_MAX:
        searchParameters.maximumAge = parseInt(value, 10)
        break
      case MrimSearchRequestFields.ZODIAC:
        searchParameters.zodiac = parseInt(value, 10)
        break
      case MrimSearchRequestFields.BIRTHDAY_MONTH:
        searchParameters.birthmonth = parseInt(value, 10)
        break
      case MrimSearchRequestFields.BIRTHDAY_DAY:
        searchParameters.birthday = parseInt(value, 10)
        break
      case MrimSearchRequestFields.ONLINE:
        searchParameters.onlyOnline = true
        break
    }
  }

  logger.debug(
    `[${connectionId}] searchParameters -> ${JSON.stringify(searchParameters)}`
  )

  const currentSearchQuery = JSON.stringify(searchParameters, Object.keys(searchParameters).sort())

  if (!state.searchPagination) {
    state.searchPagination = { query: '', offset: 0, lastTime: 0 }
  }

  const paginationTimeout = 120 * 1000
  const hasExpired = (Date.now() - state.searchPagination.lastTime) > paginationTimeout
  const isNewQuery = state.searchPagination.query !== currentSearchQuery

  if (isNewQuery || hasExpired) {
    state.searchPagination.offset = 0
    state.searchPagination.query = currentSearchQuery
  }

  const limit = 50
  const offset = state.searchPagination.offset
  logger.debug(`[${connectionId}] searchPagination: limit: ${limit} offset=${offset}`)

  const searchResults = await searchUsers(state.userId, searchParameters, state.username === searchParameters.login, limit, offset)

  state.searchPagination.lastTime = Date.now()

  if (searchResults.length > 0) {
    state.searchPagination.offset += limit
  } else {
    state.searchPagination.offset = 0
  }

  const responseFields = {
    Username: 'login',
    Nickname: 'nick',
    Domain: 'domain',
    FirstName: 'f_name',
    LastName: 'l_name',
    Location: 'location',
    Birthday: 'birthday',
    Zodiac: 'zodiac',
    Phone: 'phone',
    Sex: 'sex',
    status_title: 'status_title',
    status_desc: 'status_desc',
    mrim_status: 'mrim_status',
    status_uri: 'status_uri',
    country_id: 'country_id',
    city_id: 'city_id',
    bmonth: 'bmonth',
    bday: 'bday'
  }

  const anketaHeader = MrimAnketaHeader.writer({
    status:
      searchResults.length > 0 ? AnketaInfoStatus.OK : AnketaInfoStatus.NOUSER,
    fieldCount: Object.keys(responseFields).length,
    maxRows: searchResults.length,
    serverTime: Math.floor(Date.now() / 1000)
  }, state.utf16capable)

  let anketaInfo = new BinaryConstructor().subbuffer(anketaHeader)

  for (let key in responseFields) {
    // lol hardcode
    key = new Iconv('UTF-8', 'CP1251').convert(key ?? 'unknown')
    anketaInfo = anketaInfo.integer(key.length, 4).subbuffer(key)
  }

  for (const user of searchResults) {
    for (const key of Object.values(responseFields)) {
      let value = new Iconv('UTF-8', state.utf16capable && key !== 'birthday' && key !== 'domain' && key !== 'login' && key !== 'phone' ? 'UTF-16LE' : 'CP1251').convert(
        Object.hasOwn(user, key) && user[key] !== null ? `${user[key]}` : ''
      )

      if (key === 'mrim_status') {
        value = new Iconv('UTF-8', 'CP1251').convert('3')
      }

      if (key === 'birthday') {
        const birthday = user.birthday
          ? `${user.birthday.getFullYear()}-${(user.birthday.getMonth() + 1).toString().padStart(2, '0')}-${user.birthday.getDate().toString().padStart(2, '0')}`
          : ''
        value = new Iconv('UTF-8', 'CP1251').convert(birthday)
      }

      if (key === 'zodiac') {
        value = new Iconv('UTF-8', 'CP1251').convert(`${getZodiacId(user.birthday)}`)
      }

      anketaInfo = anketaInfo.integer(value.length, 4).subbuffer(value)
    }
  }

  anketaInfo = anketaInfo.finish()

  state.searchRateLimiter.available--

  return {
    reply: new BinaryConstructor()
      .subbuffer(
        MrimContainerHeader.writer({
          ...containerHeader,
          packetCommand: MrimMessageCommands.ANKETA_INFO,
          dataSize: anketaInfo.length
        })
      )
      .subbuffer(anketaInfo)
      .finish()
  }
}

module.exports = { processSearch }
