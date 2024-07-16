const config = require('../config')

const mysql2 = require('mysql2/promise')
const crypto = require('node:crypto')

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

  password = crypto
    .createHash('md5')
    .update(password)
    .digest('hex')
    .toLowerCase()

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `user`.`id`, `user`.`passwd` FROM `user` ' +
      'WHERE `user`.`login` = ? AND `user`.`passwd` = ?',
    [login, password]
  )

  pool.releaseConnection(connection)
  return results[0].id
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

  pool.releaseConnection(connection)
  return results
}

/**
 * Получение контактов из группы
 *
 * @param {number} userId ID пользователя
 * @returns {Promise<Array>} Массив контактов
 **/
async function getContactsFromGroups (userId) {
  const connection = await pool.getConnection()

  const [resultsAsAdder, resultsAsContact] = await Promise.all([
    connection.query(
      'SELECT `contact`.`contact_nickname` as `contact_nickname`, ' +
        '`contact`.`contact_flags`, `contact`.`is_auth_success`, ' +
        '`user`.`id` as `user_id`, ' +
        '`user`.`nick` as `user_nickname`, `user`.`login` as `user_login`, ' +
        '`user`.`status` as `user_status`, 1 as `requester_is_adder`, ' +
        '0 as `requester_is_contact` FROM `contact` ' +
        'INNER JOIN `user` ON `contact`.`contact_user_id` = `user`.`id` ' +
        'WHERE `contact`.`adder_user_id` = ?',
      [userId]
    ),
    connection.query(
      'SELECT `contact`.`adder_nickname` as `contact_nickname`, ' +
        '`contact`.`contact_flags`, `contact`.`is_auth_success`, ' +
        '`user`.`id` as `user_id`, ' +
        '`user`.`nick` as `user_nickname`, `user`.`login` as `user_login`, ' +
        '`user`.`status` as `user_status`, 0 as `requester_is_adder`, ' +
        '1 as `requester_is_contact` FROM `contact` ' +
        'INNER JOIN `user` ON `contact`.`adder_user_id` = `user`.`id` ' +
        'WHERE `contact`.`contact_user_id` = ?',
      [userId]
    )
  ])

  pool.releaseConnection(connection)

  // [{
  //   contact_nickname,
  //   contact_flags,
  //   is_auth_success,
  //   user_nickname,
  //   user_login,
  //   user_status,
  //   requester_is_adder,
  //   requester_is_contact,
  // }]
  return [...resultsAsAdder[0], ...resultsAsContact[0]]
}

/**
 * Поиск пользователей
 *
 * @param {number} userId ID пользователя
 * @param {Object} searchParameters Параметры поиска
 *
 * @returns {Promise<Array>} Массив поиска
 */
async function searchUsers (userId, searchParameters) {
  const connection = await pool.getConnection()
  let query =
    'SELECT `user`.`login`, `user`.`nick`, `user`.`f_name`, `user`.`l_name`, `user`.`location`, ' +
    '`user`.`birthday`, `user`.`zodiac`, `user`.`phone`, `user`.`sex` ' +
    'FROM `user` ' +
    'WHERE `user`.`id` != ? AND '
  const variables = [userId]

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

  if (Object.hasOwn(searchParameters, 'onlyOnline')) {
    query += '`user`.`status` = 1 AND ' // 1 = STATUS_ONLINE
  }

  // TODO mikhail КОСТЫЛЬ КОСТЫЛЬ КОСТЫЛЬ
  query = query.substring(0, query.length - 4) + 'LIMIT 50'

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(query, variables)

  pool.releaseConnection(connection)
  return results
}

/**
 * Добавление, либо дополнить контакта в групп контактов
 *
 * @param {number} requesterUserId ID добавящего пользователя
 * @param {string} contactUserLogin Логин пользователя, записанного в контактах
 * @param {string} contactNickname Никнейм будущего контакта
 * @param {number} contactFlags Флаги будущего контакта
 * @param {number} groupIndex Индекс группы контактов
 *
 * @returns {object} Объект с типом действия и ID контакта
 */
async function createOrCompleteContact (
  requesterUserId,
  contactUserLogin,
  contactNickname,
  contactFlags,
  groupIndex
) {
  const connection = await pool.getConnection()
  let result

  const [contactUserResult, groupResult] = await Promise.all([
    connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ?',
      [contactUserLogin]
    ),
    connection.query(
      'SELECT `contact_group`.`id` FROM `contact_group` WHERE ' +
          '`contact_group`.`user_id` = ? AND `contact_group`.`idx` = ?',
      [requesterUserId, groupIndex]
    )
  ])

  const [{ id: contactUserId }] = contactUserResult[0]
  const [{ id: groupId }] = groupResult[0]

  try { // дополнение контакта
    // eslint-disable-next-line no-unused-vars
    const [existingContactResult, _existingContactFields] =
      await connection.query(
        'SELECT `contact`.`id` FROM `contact` WHERE ' +
        '`contact`.`adder_user_id` = ? AND ' +
        '`contact`.`contact_user_id` = ?',
        [contactUserId, requesterUserId]
      )
    const [{ id: existingContactId }] = existingContactResult

    await connection.execute(
      'UPDATE `contact` SET ' +
      '`contact`.`adder_nickname` = ?, `contact`.`adder_flags` = ?, ' +
      '`contact`.`contact_group_id` = ?, `contact`.`is_auth_success` = 1 ' +
      'WHERE `contact`.`id` = ?',
      [contactNickname, contactFlags, groupId, existingContactId]
    )

    result = { action: 'MODIFY_EXISTING', contactId: existingContactId }
  } catch (error) { // создание контакта
    console.log(error)
    const { insertId } = await connection.execute(
      'INSERT INTO `contact`' +
      '(`contact`.`adder_user_id`, `contact`.`contact_user_id`, ' +
      ' `contact`.`adder_group_id`, `contact`.`contact_nickname`, ' +
      ' `contact`.`contact_flags`)' +
      'VALUES (?, ?, ?, ?, ?)',
      [requesterUserId, contactUserId, groupId, contactNickname, contactFlags]
    )

    result = { action: 'CREATE_NEW', contactId: insertId }
  }

  pool.releaseConnection(connection)
  return result
}

/**
 * Создание новой группы контактов
 *
 * @param {number} userId ID пользователя
 * @param {string} groupName Имя группы
 *
 * @returns {Promise<number>} Индекс группы контактов
 */
async function createNewGroup (userId, groupName) {
  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [countResults, _countFields] = await connection.query(
    'SELECT COUNT(`contact_group`.`id`) as `contact_group_cnt` ' +
      'FROM `contact_group` ' +
      'WHERE `contact_group`.`user_id` = ?',
    [userId]
  )
  const groupIndex = countResults[0].contact_group_cnt

  await connection.execute(
    'INSERT INTO `contact_group` ' +
      '(`contact_group`.`user_id`, `contact_group`.`name`, `contact_group`.`idx`) ' +
      'VALUES (?, ?, ?)',
    [userId, groupName, groupIndex]
  )

  pool.releaseConnection(connection)
  return groupIndex
}

/**
 * Редактировать имя группы контактов
 *
 * @param {number} userId ID пользователя
 * @param {number} groupIndex Индекс группы
 * @param {string} groupName Новое имя группы
 */
async function modifyGroupName (userId, groupIndex, groupName) {
  const connection = await pool.getConnection()

  await connection.execute(
    'UPDATE `contact_group` ' +
      'SET `contact_group`.`name` = ? ' +
      'WHERE `contact_group`.`user_id` = ? AND `contact_group`.`idx` = ?',
    [groupName, userId, groupIndex]
  )

  pool.releaseConnection(connection)
}

/**
 * Удалить группу контактов
 *
 * @param {number} userId ID пользователя
 * @param {number} groupIndex Индекс группы
 */
async function deleteGroup (userId, groupIndex) {
  const connection = await pool.getConnection()

  await connection.execute(
    'DELETE FROM `contact_group` ' +
      'WHERE `contact_group`.`user_id` = ? AND `contact_group`.`idx` = ?',
    [userId, groupIndex]
  )

  await connection.execute(
    'UPDATE `contact_group` ' +
      'SET `contact_group`.`idx` = `contact_group`.`idx` - 1 ' +
      'WHERE `contact_group`.`user_id` = ? AND `contact_group`.`idx` > ?',
    [userId, groupIndex]
  )

  pool.releaseConnection(connection)
}

/**
 * Редактировать контакта
 *
 * @param {number} requesterUserId ID добавящего пользователя
 * @param {string} contactUserLogin Логин пользователя, записанного в контактах
 * @param {string} contactNickname Новый никнейм контакта
 * @param {number} contactFlags Новые флаги контакта
 * @param {number} groupIndex Новый индекс группы контактов
 */
async function modifyContact (
  requesterUserId,
  contactUserLogin,
  contactNickname,
  contactFlags,
  groupIndex
) {
  const connection = await pool.getConnection()

  const [contactUserResult, groupResult] = await Promise.all([
    connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ?',
      [contactUserLogin]
    ),
    connection.query(
      'SELECT `contact_group`.`id` FROM `contact_group` WHERE ' +
            '`contact_group`.`user_id` = ? AND `contact_group`.`idx` = ?',
      [requesterUserId, groupIndex]
    )
  ])

  const [{ id: contactUserId }] = contactUserResult[0]
  const groupId = groupResult[0].length === 1
    ? groupResult[0][0].id
    : null

  try { // обновление контакта как сам контакт
    // eslint-disable-next-line no-unused-vars
    const [existingContactResult, _existingContactFields] =
      await connection.query(
        'SELECT `contact`.`id` WHERE ' +
        '`contact`.`adder_user_id` = ? AND ' +
        '`contact`.`contact_user_id` = ?',
        [contactUserId, requesterUserId]
      )
    const [{ id: existingContactId }] = existingContactResult

    await connection.execute(
      'UPDATE `contact` SET ' +
        '`contact`.`adder_nickname` = ?, `contact`.`adder_flags` = ?, ' +
        '`contact`.`contact_group_id` = ? WHERE `contact`.`id` = ?',
      [contactNickname, contactFlags, groupId, existingContactId]
    )
  } catch { // обновление контакта как добавящий
    await connection.execute(
      'UPDATE `contact` SET ' +
      '`contact`.`contact_nickname` = ?, `contact`.`contact_flags` = ?, ' +
      '`contact`.`adder_group_id` = ? WHERE ' +
      '`contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ?',
      [contactNickname, contactFlags, groupId, requesterUserId, contactUserId]
    )
  }

  pool.releaseConnection(connection)
}

/**
 * Удалить контакт
 *
 * @param {number} adderUserId ID пользователя добавящего
 * @param {string} contactLogin Логин пользователя контакта
 * @returns {number} ID пользователя контакта
 */
async function deleteContact (adderUserId, contactLogin) {
  const contacts = await getContactsFromGroups(adderUserId)

  const contact = contacts.find((contact) => contact.user_login === contactLogin)

  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [contactUserResults, _contactUserFields] = await connection.query(
    'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? LIMIT 1',
    [contactLogin]
  )

  if (contactUserResults.length !== 1) {
    throw new Error('contact user not found')
  }

  const [{ id: contactUserId }] = contactUserResults

  if (contact.is_auth_success === 1) {
    const [contactDataResultsAsAdder, contactDataResultsAsContact] = await Promise.all([
      connection.query(
        'SELECT * FROM `contact` WHERE ' +
        '`contact`.`adder_user_id` = ? AND ' +
        '`contact`.`contact_user_id` = ?',
        [adderUserId, contactUserId]
      ),
      connection.query(
        'SELECT * FROM `contact` WHERE ' +
        '`contact`.`adder_user_id` = ? AND ' +
        '`contact`.`contact_user_id` = ?',
        [contactUserId, adderUserId]
      )
    ])

    let contactData

    if (contactDataResultsAsAdder[0].length === 1 || contactDataResultsAsContact[0].length === 1) {
      contactData = contact.requester_is_adder === 1
        ? contactDataResultsAsAdder[0][0]
        : contactDataResultsAsContact[0][0]
    } else {
      throw new Error('contact not found')
    }

    await connection.execute(
      // ебем сервер БД как можем
      'UPDATE `contact` SET ' +
      '`contact`.`adder_user_id` = ?, ' +
      '`contact`.`contact_user_id` = ?, ' +
      '`contact`.`adder_group_id` = NULL, ' +
      '`contact`.`contact_group_id` = ?, ' +
      '`contact`.`is_auth_success` = 0, ' +
      '`contact`.`adder_nickname` = ?, ' +
      '`contact`.`contact_nickname` = ?, ' +
      '`contact`.`adder_flags` = 0, ' +
      '`contact`.`contact_flags` = ? ' +
      'WHERE `contact`.`adder_user_id` = ? ' +
      'AND `contact`.`contact_user_id` = ?',
      [
        ...(
          contact.requester_is_adder === 1
            ? [
                contactData.contact_user_id,
                contactData.adder_user_id,
                contactData.adder_group_id,
                contactData.contact_nickname,
                contactData.adder_nickname,
                contactData.adder_flags
              ]
            : [
                contactData.adder_user_id,
                contactData.contact_user_id,
                contactData.contact_group_id,
                contactData.adder_nickname,
                contactData.contact_nickname,
                contactData.contact_flags
              ]
        ),
        adderUserId,
        contactUserResults[0].id
      ]
    )
  } else {
    await connection.execute(
      'DELETE FROM `contact` WHERE `contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ?',
      contact.requester_is_adder === 1
        ? [adderUserId, contactUserResults[0].id]
        : [contactUserResults[0].id, adderUserId]
    )
  }

  pool.releaseConnection(connection)
  return contactUserResults[0].id
}

/**
 * Редактировать статус пользователя
 *
 * @param {number} userId ID пользователя
 * @param {number} status Статус пользователя
 */
async function modifyUserStatus (userId, status) {
  const connection = await pool.getConnection()

  await connection.execute(
    'UPDATE `user` SET `user`.`status` = ? WHERE `user`.`id` = ?',
    [status, userId]
  )

  pool.releaseConnection(connection)
}

/**
 * Проверяет, добавил ли его пользователь #2
 *
 * @param {number} user ID пользователя
 * @param {string} contact Username пользователя #2
 * @returns {Boolean}
 **/
async function isContactAuthorized (user, contact) {
  const connection = await pool.getConnection()

  const contactUserResult =
    await connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ?',
      [contact]
    )

  const [{ id: contactUserId }] = contactUserResult[0]

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] =
    await connection.query(
      'SELECT `contact`.`contact_nickname` as `contact_nickname`, ' +
        '`contact`.`is_auth_success`' +
        'FROM `contact` ' +
        'INNER JOIN `user` ON `contact`.`contact_user_id` = `user`.`id` ' +
        'WHERE `contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ? AND `contact`.`is_auth_success` = 1',
      [contactUserId, user]
    )

  pool.releaseConnection(connection)
  return results.length > 0
}

module.exports = {
  getUserIdViaCredentials,
  getContactGroups,
  getContactsFromGroups,
  createOrCompleteContact,
  createNewGroup,
  searchUsers,
  modifyGroupName,
  deleteGroup,
  modifyContact,
  deleteContact,
  modifyUserStatus,
  isContactAuthorized
}
