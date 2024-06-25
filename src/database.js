const config = require('../config')

const mysql2 = require('mysql2/promise')
const bcrypt = require('bcrypt')

const pool = mysql2.createPool(config.database.connectionUri)

/**
 * Получение пользователя при помощи учетных данных
 *
 * @param {string} login Имя пользователя
 * @param {string} password Пароль пользователя
 *
 * @returns {Promise<number>} ID пользователя
 */
async function getUserIdViaCredentials (login, password) {
  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `user`.`id`, `user`.`passwd` FROM `user` WHERE `user`.`login` = ?',
    [login]
  )

  if (results.length === 0) {
    throw new Error(`пользователь ${login} не найден`)
  }

  const [user] = results

  if (!bcrypt.compareSync(password, user.passwd)) {
    throw new Error('пароль неверный')
  }

  return user.id
}

/**
 * Получение группы контактов пользователя
 *
 * @param {number} userId ID пользователя
 * @returns {Promise<Array>} Массив групп контактов
 */
async function getContactGroups (userId) {
  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `contact_group`.`id`, `contact_group`.`name` ' +
      'FROM `contact_group` ' +
      'WHERE `contact_group`.`user_id` = ? ' +
      'ORDER BY `contact_group`.`name`',
    [userId]
  )

  return results
}

/**
 * Получение контакты из группы контактов
 *
 * @param {number} ownerUserId ID владелец контакта
 * @param {number} contactGroupId ID группы контактов
 *
 * @returns {Promise<Array>} Массив контактов
 **/
async function getContactsFromGroup (ownerUserId, contactGroupId) {
  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `contact`.`contact_group_id`, `user`.`id`, `user`.`login` ' +
      'FROM `contact` ' +
      'INNER JOIN `user` ' +
      'ON `contact`.`user_id` = `user`.`id`' +
      'WHERE `contact`.`owner_user_id` = ? AND `contact`.`contact_group_id` = ? ',
    [ownerUserId, contactGroupId]
  )

  return results
}

/**
 * Поиск пользователей
 *
 * @param {Object} searchParameters Параметры поиска
 * @returns {Promise<Array>} Массив поиска
 */
async function searchUsers (searchParameters) {
  const connection = await pool.getConnection()
  let query =
    'SELECT `user`.`login`, `user`.`nick`, `user`.`f_name`, `user`.`l_name`, `user`.`location`, ' +
    '`user`.`birthday`, `user`.`zodiac`, `user`.`phone`, `user`.`sex` ' +
    'FROM `user` ' +
    'WHERE '
  const variables = []

  if (Object.hasOwn(searchParameters, 'login')) {
    query += '`user`.`login` LIKE %?% AND '
    variables.push(`%${searchParameters.login}%`)
  }

  if (Object.hasOwn(searchParameters, 'nickname')) {
    query += '`user`.`nick` LIKE ? AND '
    variables.push(`%${searchParameters.nickname}%`)
  }

  if (Object.hasOwn(searchParameters, 'firstName')) {
    query += '`user`.`f_name` LIKE ? AND '
    variables.push(`%${searchParameters.firstName}%`)
  }

  if (Object.hasOwn(searchParameters, 'lastName')) {
    query += '`user`.`l_name` LIKE ? AND '
    variables.push(`%${searchParameters.lastName}%`)
  }

  if (
    Object.hasOwn(searchParameters, 'minimumAge') &&
    Object.hasOwn(searchParameters, 'maximumAge')
  ) {
    query += 'YEAR(CURDATE()) - YEAR(`user`.`birthday`) BETWEEN ? AND ? AND '
    variables.push(searchParameters.minimumAge, searchParameters.maximumAge)
  }

  if (
    Object.hasOwn(searchParameters, 'minimumAge') &&
    !Object.hasOwn(searchParameters, 'maximumAge')
  ) {
    query += 'YEAR(CURDATE()) - YEAR(`user`.`birthday`) >= ? AND '
    variables.push(searchParameters.minimumAge)
  }

  if (
    Object.hasOwn(searchParameters, 'maximumAge') &&
    !Object.hasOwn(searchParameters, 'minimumAge')
  ) {
    query += 'YEAR(CURDATE()) - YEAR(`user`.`birthday`) <= ? AND '
    variables.push(searchParameters.maximumAge)
  }

  if (Object.hasOwn(searchParameters, 'zodiac')) {
    query += '`user`.`zodiac` = ? AND '
    variables.push(searchParameters.zodiac)
  }

  if (Object.hasOwn(searchParameters, 'birthmonth')) {
    query += 'MONTH(`user`.`birthday`) = ? AND '
    variables.push(searchParameters.birthmonth)
  }

  if (Object.hasOwn(searchParameters, 'birthday')) {
    query += 'DAY(`user`.`birthday`) = ? AND '
    variables.push(searchParameters.birthday)
  }

  // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
  query = query.substring(0, query.length - 4) + 'LIMIT 50'
  console.log(query)

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(query, variables)
  return results
}

module.exports = {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroup,
  searchUsers
}
