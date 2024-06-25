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

module.exports = {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroup
}
