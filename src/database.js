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
      'ORDER BY `contact_group`.`idx`',
    [userId]
  )

  return results
}

/**
 * Получение контакты из группы контактов
 *
 * @param {number} ownerUserId ID владелец контакта
 * @returns {Promise<Array>} Массив контактов
 **/
async function getContactsFromGroups (ownerUserId) {
  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `contact`.`contact_group_id`, `user`.`id`, `user`.`login` ' +
      'FROM `contact` ' +
      'INNER JOIN `user` ON `contact`.`user_id` = `user`.`id` ' +
      'WHERE `contact`.`owner_user_id` = ?',
    [ownerUserId]
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
    query += '`user`.`login` LIKE ? AND '
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

/**
 * Добавление контакта
 *
 * @param {number} ownerUserId ID владелец пользователя
 * @param {number} groupIndex Индекс группы
 * @param {String} contactLogin Логин контакта
 */
async function addContactToGroup (ownerUserId, groupIndex, contactLogin) {
  const connection = await pool.getConnection()

  const [contactUserResults, groupResults] = await Promise.all([
    connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ?',
      [contactLogin]
    ),
    connection.query(
      'SELECT `contact_group`.`id` FROM `contact_group` ' +
        'WHERE `contact_group`.`user_id` = ? AND `contact_group`.`idx` = ?',
      [ownerUserId, groupIndex]
    )
  ])

  if (contactUserResults[0].length === 0 || groupResults[0].length === 0) {
    throw new Error('либо пользователь, либо группа не найдена')
  }

  const [{ id: contactUserId }] = contactUserResults[0]
  const [{ id: contactGroupId }] = groupResults[0]

  await connection.execute(
    'INSERT INTO `contact` ' +
      '(contact_group_id, owner_user_id, user_id) ' +
      'VALUES (?, ?, ?)',
    [contactGroupId, ownerUserId, contactUserId]
  )
}

module.exports = {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroups,
  addContactToGroup,
  searchUsers
}
