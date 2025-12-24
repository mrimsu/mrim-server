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
async function getUserIdViaCredentials (login, domain, password, isMD5Already = false) {
  const connection = await pool.getConnection()

  if (!isMD5Already) {
    password = crypto
      .createHash('md5')
      .update(password)
      .digest('hex')
      .toLowerCase()
  }

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `user`.`id`, `user`.`passwd` FROM `user` ' +
      'WHERE `user`.`login` = ? AND `user`.`domain` = ? AND `user`.`passwd` = ?',
    [login, domain, password]
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
        '`contact`.`adder_flags`, ' +
        '`contact`.`contact_flags`, `contact`.`is_auth_success`, ' +
        '`contact`.`contact_group_id`, `contact`.`adder_group_id`, ' +
        '`user`.`id` as `user_id`, `user`.`domain` as `user_domain`, ' +
        '`user`.`nick` as `user_nickname`, `user`.`login` as `user_login`, ' +
        '`user`.`status` as `user_status`, 1 as `requester_is_adder`, ' +
        '0 as `requester_is_contact` FROM `contact` ' +
        'INNER JOIN `user` ON `contact`.`contact_user_id` = `user`.`id` ' +
        'WHERE `contact`.`adder_user_id` = ?',
      [userId]
    ),
    connection.query(
      'SELECT `contact`.`adder_nickname` as `contact_nickname`, ' +
        '`contact`.`adder_flags`, ' +
        '`contact`.`contact_flags`, `contact`.`is_auth_success`, ' +
        '`contact`.`contact_group_id`, `contact`.`adder_group_id`, ' +
        '`user`.`id` as `user_id`, `user`.`domain` as `user_domain`, ' +
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
async function searchUsers (userId, searchParameters, searchMyself = false) {
  const connection = await pool.getConnection()
  let query =
    'SELECT `user`.`login`, `user`.`domain`, `user`.`nick`, `user`.`f_name`, `user`.`l_name`, `user`.`location`, ' +
    '`user`.`birthday`, `user`.`zodiac`, `user`.`phone`, `user`.`sex` ' +
    'FROM `user` WHERE '
  const variables = []

  if (!searchMyself) {
    query += '`user`.`id` != ? AND '
    variables.push(userId)
  }

  if (Object.hasOwn(searchParameters, 'login')) {
    query += '`user`.`login` LIKE ? AND '
    variables.push(`%${searchParameters.login}%`)
  }

  if (Object.hasOwn(searchParameters, 'domain')) {
    query += '`user`.`domain` LIKE ? AND '
    variables.push(`%${searchParameters.domain}%`)
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

  if (Object.hasOwn(searchParameters, 'zodiac') && !Number.isNaN(Number(searchParameters.zodiac))) {
    query += '`user`.`zodiac` = ? AND '
    variables.push(Number(searchParameters.zodiac))
  }

  if (Object.hasOwn(searchParameters, 'birthmonth') && !Number.isNaN(Number(searchParameters.birthmonth))) {
    query += 'MONTH(`user`.`birthday`) = ? AND '
    variables.push(Number(searchParameters.birthmonth))
  }

  if (Object.hasOwn(searchParameters, 'birthday') && !Number.isNaN(Number(searchParameters.birthday))) {
    query += 'DAY(`user`.`birthday`) = ? AND '
    variables.push(Number(searchParameters.birthday))
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
 * Получить айди через логин
 *
 * @param {string} login Логин пользователя
 * @param {string} domain Виртуальный домен пользователя
 *
 * @returns {number} ID пользователя
 */
async function getIdViaLogin (login, domain = 'mail.ru') {
  const connection = await pool.getConnection()
  const result = await connection.query(
    'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
    [login, domain]
  )

  pool.releaseConnection(connection)
  return result[0][0].id ?? 0
}

/**
 * Проверить, существует ли пользователь под данным логином
 *
 * @param {string} login Логин пользователя
 * @param {string} domain Виртуальный домен пользователя
 *
 * @returns {boolean} Результат проверки
 */
async function checkUser (login, domain = 'mail.ru') {
  const connection = await pool.getConnection()
  const result = await connection.query(
    'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
    [login, domain]
  )

  pool.releaseConnection(connection)
  return result[0].length > 0
}

/**
 * Регистрация нового пользователя
 *
 * @param {number} userId ID пользователя
 * @param {Object} userData Данные пользователя
 *
 * @returns {Promise<boolean>} Результат регистрации
 */
async function registerUser (userData) {
  const connection = await pool.getConnection()
  const query =
    'INSERT INTO `user` (`login`, `passwd`, `domain`, `nick`, `f_name`, `l_name`, `location`, `birthday`, `sex`) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  const variables = [
    userData.login,
    crypto.createHash('md5').update(userData.passwd).digest('hex').toLowerCase(),
    userData.domain,
    userData.nick,
    userData.f_name,
    userData.l_name,
    userData.location,
    userData.birthday,
    userData.sex
  ]

  const [result] = await connection.query(query, variables)
  pool.releaseConnection(connection)
  return result.insertId
}

/**
 * Добавление, либо дополнить контакта в групп контактов
 *
 * @param {number} requesterUserId ID добавящего пользователя
 * @param {string} contactUserLogin Логин пользователя, записанного в контактах
 * @param {string} contactDomain Виртуальный домен пользователя, записанного в контактах
 * @param {string} contactNickname Никнейм будущего контакта
 * @param {number} contactFlags Флаги будущего контакта
 * @param {number} groupIndex Индекс группы контактов
 *
 * @returns {object} Объект с типом действия и ID контакта
 */
async function createOrCompleteContact (
  requesterUserId,
  contactUserLogin,
  contactDomain,
  contactNickname,
  contactFlags,
  groupIndex
) {
  const connection = await pool.getConnection()
  let result

  const [contactUserResult, groupResult] = await Promise.all([
    connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
      [contactUserLogin, contactDomain]
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

    let authQuery = ''

    if (existingContactResult[0].is_auth_success === 0 && 
        existingContactResult[0].adder_user_id === contactUserId && 
        existingContactResult[0].contact_user_id === requesterUserId) {
      authQuery = ', `contact`.`is_auth_success` = 1'
    }

    await connection.execute(
      'UPDATE `contact` SET ' +
      '`contact`.`adder_nickname` = ?, `contact`.`adder_flags` = ?, ' +
      '`contact`.`contact_group_id` = ?' + authQuery +
      ' WHERE `contact`.`id` = ?',
      [contactNickname, contactFlags, groupId, existingContactId]
    )

    result = { action: 'MODIFY_EXISTING', contactId: existingContactId }
  } catch (error) {
    // во бля попадос
    // не проблема, просто наоборот сделаем
    try {
      const [existingContactResult, _existingContactFields] =
      await connection.query(
        'SELECT `contact`.`id` FROM `contact` WHERE ' +
        '`contact`.`adder_user_id` = ? AND ' +
        '`contact`.`contact_user_id` = ?',
        [requesterUserId, contactUserId]
      )

      const [{ id: existingContactId }] = existingContactResult

      let authQuery = ''

      if (existingContactResult[0].is_auth_success === 0 && 
          existingContactResult[0].adder_user_id === requesterUserId && 
          existingContactResult[0].contact_user_id === contactUserId) {
        authQuery = ', `contact`.`is_auth_success` = 1'
      }

      await connection.execute(
        'UPDATE `contact` SET ' +
      '`contact`.`contact_nickname` = ?, `contact`.`contact_flags` = ?, ' +
      '`contact`.`adder_group_id` = ?' + authQuery +
      ' WHERE `contact`.`id` = ?',
        [contactNickname, contactFlags, groupId, existingContactId]
      )

      result = { action: 'MODIFY_EXISTING', authSuccess: authQuery !== '', contactId: existingContactId }
    } catch (error) {
      // ну ладно создадим контакта
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
  }

  await connection.commit()
  pool.releaseConnection(connection)

  return result
}

/**
 * Авторизация существующего контакта для команды MESSAGE с флагом на добавление контакта
 *
 * @param {number} requesterUserId ID добавящего пользователя
 * @param {string} contactUserLogin Логин пользователя, записанного в контактах
 * @param {string} contactDomain Виртуальный домен пользователя, записанного в контактах
 */

async function addContactMSG (requesterUserId, contactUserLogin, contactDomain) {
  const connection = await pool.getConnection()
  let result

  const contactUserResult = await Promise.all([
    connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
      [contactUserLogin, contactDomain]
    )
  ])

  const existingContactResult = await connection.query(
    'SELECT `contact`.`id` FROM `contact` WHERE ' +
    '`contact`.`adder_user_id` = ? AND ' +
    '`contact`.`contact_user_id` = ?',
    [contactUserResult[0][0][0].id, requesterUserId]
  )

  try {
    const [{ id: existingContactId }] = existingContactResult[0]

    await connection.execute(
      'UPDATE `contact` SET ' +
      '`contact`.`is_auth_success` = 1 ' +
      'WHERE `contact`.`id` = ?',
      [existingContactId]
    )
    result = true
  } catch (error) {
    result = false
  }

  await connection.commit()
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

  await connection.commit()
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

  await connection.commit()
  pool.releaseConnection(connection)
}

/**
 * Удалить группу контактов
 *
 * @param {number} userId ID пользователя
 * @param {number} groupIndex Индекс группы
 */
async function deleteGroup (userId, groupIndex, request) {
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

  await connection.commit()
  pool.releaseConnection(connection)
}

/**
 * Получить отдельный контакт
 *
 * @param {number} requesterUserId ID добавящего пользователя
 * @param {string} contactUserLogin Логин пользователя, записанного в контактах
 * @param {string} contactDomain Виртуальный домен пользователя, записанного в контактах
 * @param {number} groupIndex Новый индекс группы контактов
 */
async function getContact (
  requesterUserId,
  contactUserLogin,
  contactDomain
) {
  const connection = await pool.getConnection()

  const contactUserResult = await connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
      [contactUserLogin, contactDomain]
    )

  const [{ id: contactUserId }] = contactUserResult[0]

  
  // eslint-disable-next-line no-unused-vars
  let [existingContactResult, _existingContactFields] =
    await connection.query(
      'SELECT `contact`.`contact_nickname` as `contact_nickname`, ' +
      '`contact`.`adder_flags`, ' +
      '`contact`.`contact_flags`, `contact`.`is_auth_success`, ' +
      '`contact`.`contact_group_id`, `contact`.`adder_group_id`, ' +
      '`user`.`id` as `user_id`, `user`.`domain` as `user_domain`, ' +
      '`user`.`nick` as `user_nickname`, `user`.`login` as `user_login`, ' +
      '`user`.`status` as `user_status`, 0 as `requester_is_adder`, ' +
      '1 as `requester_is_contact` FROM `contact` ' +
      'INNER JOIN `user` ON `contact`.`contact_user_id` = `user`.`id` ' +
      'WHERE `contact`.`adder_user_id` = ? AND ' +
      '`contact`.`contact_user_id` = ?',
      [contactUserId, requesterUserId]
    )
  
  if (existingContactResult.length === 0) {
    // попробуем наоборот
    [existingContactResult, _existingContactFields] =
      await connection.query(
        'SELECT `contact`.`contact_nickname` as `contact_nickname`, ' +
        '`contact`.`adder_flags`, ' +
        '`contact`.`contact_flags`, `contact`.`is_auth_success`, ' +
        '`contact`.`contact_group_id`, `contact`.`adder_group_id`, ' +
        '`user`.`id` as `user_id`, `user`.`domain` as `user_domain`, ' +
        '`user`.`nick` as `user_nickname`, `user`.`login` as `user_login`, ' +
        '`user`.`status` as `user_status`, 1 as `requester_is_adder`, ' +
        '0 as `requester_is_contact` FROM `contact` ' +
        'INNER JOIN `user` ON `contact`.`contact_user_id` = `user`.`id` ' +
        'WHERE `contact`.`adder_user_id` = ? AND ' +
        '`contact`.`contact_user_id` = ?',
        [requesterUserId, contactUserId]
      )
  }

  pool.releaseConnection(connection)
  return existingContactResult.length > 0 ? existingContactResult[0] : null;
}

/**
 * Редактировать контакта
 *
 * @param {number} requesterUserId ID добавящего пользователя
 * @param {string} contactUserLogin Логин пользователя, записанного в контактах
 * @param {string} contactDomain Виртуальный домен пользователя, записанного в контактах
 * @param {string} contactNickname Новый никнейм контакта
 * @param {number} contactFlags Новые флаги контакта
 * @param {number} groupIndex Новый индекс группы контактов
 */
async function modifyContact (
  requesterUserId,
  contactUserLogin,
  contactDomain,
  contactNickname,
  contactFlags,
  groupIndex
) {
  const connection = await pool.getConnection()

  const [contactUserResult, groupResult] = await Promise.all([
    connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
      [contactUserLogin, contactDomain]
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
        'SELECT `contact`.`id` FROM `contact` WHERE ' +
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
  } catch {
    // попробуем наоборот
    try {
      const [existingContactResult, _existingContactFields] =
        await connection.query(
          'SELECT `contact`.`id` FROM `contact` WHERE ' +
          '`contact`.`adder_user_id` = ? AND ' +
          '`contact`.`contact_user_id` = ?',
          [requesterUserId, contactUserId]
        )
      const [{ id: existingContactId }] = existingContactResult

      await connection.execute(
        'UPDATE `contact` SET ' +
          '`contact`.`contact_nickname` = ?, `contact`.`contact_flags` = ?, ' +
          '`contact`.`adder_group_id` = ? WHERE `contact`.`id` = ?',
        [contactNickname, contactFlags, groupId, existingContactId]
      )
    } catch {
      // обновление контакта как добавящий
      await connection.execute(
        'UPDATE `contact` SET ' +
        '`contact`.`contact_nickname` = ?, `contact`.`contact_flags` = ?, ' +
        '`contact`.`adder_group_id` = ? WHERE ' +
        '`contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ?',
        [contactNickname, contactFlags, groupId, requesterUserId, contactUserId]
      )
    }
  }

  await connection.commit()
  pool.releaseConnection(connection)
}

/**
 * Удалить контакт
 *
 * @param {number} adderUserId ID пользователя добавящего
 * @param {string} contactLogin Логин пользователя контакта
 * @param {string} contactDomain Виртуальный домен пользователя контакта
 *
 * @returns {number} ID пользователя контакта
 */
async function deleteContact (adderUserId, contactLogin, contactDomain) {
  const contacts = await getContactsFromGroups(adderUserId)
  const contact = contacts.find((contact) => contact.user_login === contactLogin && contact.user_domain === contactDomain)

  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [contactUserResults, _contactUserFields] = await connection.query(
    'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ? LIMIT 1',
    [contactLogin, contactDomain]
  )

  if (contactUserResults.length !== 1) {
    throw new Error('contact user not found')
  }

  if (contact === undefined) {
    return null
  }

  await connection.execute(
    'DELETE FROM `contact` WHERE `contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ?',
    contact.requester_is_adder === 1
      ? [adderUserId, contactUserResults[0].id]
      : [contactUserResults[0].id, adderUserId]
  )

  await connection.commit()
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

  await connection.commit()
  pool.releaseConnection(connection)
}

/**
 * Получить оффлайн сообщения
 *
 * @param {number} userId ID пользователя
 */
async function getOfflineMessages (userId) {
  const connection = await pool.getConnection()

  const [offlineMessages, _offlineMessages] = await connection.execute(
    'SELECT `date`, `message`, `user`.`id` as `user_id`, ' +
    '`user`.`nick` as `user_nickname`, `user`.`login` as `user_login`, ' +
    '`user`.`domain` as `user_domain` ' +
    'FROM `offline_messages` ' +
    'INNER JOIN `user` ON `offline_messages`.`user_from` = `user`.`id` ' +
      'WHERE `user_to` = ?',

    [userId]
  )

  await connection.commit()
  pool.releaseConnection(connection)

  return offlineMessages
}

/**
 * Отчистить оффлайн сообщения у пользователя
 *
 * @param {number} userId ID пользователя
 */
async function cleanupOfflineMessages (userId) {
  const connection = await pool.getConnection()

  await connection.execute(
    'DELETE FROM `offline_messages` ' +
      'WHERE `user_to` = ?',
    [userId]
  )

  await connection.commit()
  pool.releaseConnection(connection)
}

/**
 * Отправить оффлайн сообщение пользователю
 *
 * @param {number} userIdFrom ID отправителя
 * @param {number} userIdTo ID получателя
 * @param {string} message Сообщение
 */
async function sendOfflineMessage (userIdFrom, userIdTo, message) {
  const connection = await pool.getConnection()

  const date = Math.floor(Date.now() / 1000)

  await connection.execute(
    'INSERT INTO `offline_messages` ' +
    '(`user_from`, `user_to`, `date`, `message`)' +
    'VALUES (?, ?, ?, ?)',
    [userIdFrom, userIdTo, date, message]
  )

  await connection.commit()
  pool.releaseConnection(connection)
}

/**
 * Проверяет, добавил ли его пользователь #2
 *
 * @param {number} user ID пользователя
 * @param {string} contact Username пользователя #2
 * @param {string} contactDomain Виртуальный домен пользователя #2
 * @returns {Promise<Boolean>}
 **/
async function isContactAuthorized (user, contact, contactDomain) {
  const connection = await pool.getConnection()

  const contactUserResult =
    await connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
      [contact, contactDomain]
    )

  if (contactUserResult[0].length === 0) {
    pool.releaseConnection(connection)
    return false
  }

  const [{ id: contactUserId }] = contactUserResult[0]

  // eslint-disable-next-line no-unused-vars
  let results, _fields
  try {
    [results, _fields] =
    await connection.query(
      'SELECT `contact`.`contact_nickname` as `contact_nickname`, ' +
      '`contact`.`is_auth_success`' +
      'FROM `contact` ' +
      'INNER JOIN `user` ON `contact`.`contact_user_id` = `user`.`id` ' +
      'WHERE `contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ? AND `contact`.`is_auth_success` = 1',
      [contactUserId, user]
    )
  } catch (error) {
    // ух ты а давай наоборот попробуем
    [results, _fields] =
    await connection.query(
      'SELECT `contact`.`contact_nickname` as `contact_nickname`, ' +
      '`contact`.`is_auth_success`' +
      'FROM `contact` ' +
      'INNER JOIN `user` ON `contact`.`contact_user_id` = `user`.`id` ' +
      'WHERE `contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ? AND `contact`.`is_auth_success` = 1',
      [user, contactUserId]
    )
  }

  pool.releaseConnection(connection)
  return results.length > 0
}


/**
 * Проверяет, добавляющий ли это пользователь #2
 *
 * @param {number} user ID пользователя
 * @param {string} contact Username пользователя #2
 * @param {string} contactDomain Виртуальный домен пользователя #2
 * @returns {Promise<Boolean>}
 **/
async function isContactAdder (user, contact, contactDomain) {
  const connection = await pool.getConnection()

  const contactUserResult =
    await connection.query(
      'SELECT `user`.`id` FROM `user` WHERE `user`.`login` = ? AND `user`.`domain` = ?',
      [contact, contactDomain]
    )

  if (contactUserResult[0].length === 0) {
    pool.releaseConnection(connection)
    return undefined
  }

  const [{ id: contactUserId }] = contactUserResult[0]

  // eslint-disable-next-line no-unused-vars
  let results, _fields
  try {
    [results, _fields] =
    await connection.query(
      'SELECT `contact`.`id`' +
      'FROM `contact` ' +
      'WHERE `contact`.`adder_user_id` = ? AND `contact`.`contact_user_id` = ?',
      [contactUserId, user]
    )
    pool.releaseConnection(connection)
    return results.length > 0
  } catch (error) {
    return false
  }
}

/**
 * Получение пути к аватару пользователя
 *
 * @param {string} userLogin Логин пользователя
 * @param {string} userDomain Логин пользователя
 *
 * @returns {string} Путь к аватару пользователя
 */
async function getUserAvatar (userLogin, userDomain) {
  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `user`.`avatar` FROM `user` ' +
    'WHERE `user`.`login` = ? AND `user`.`domain` LIKE ? AND' +
    '`user`.`avatar` IS NOT NULL ' +
    'LIMIT 1',
    [userLogin, `${userDomain}%`]
  )

  pool.releaseConnection(connection)

  if (results.length === 0) {
    throw new Error('no avatar found')
  }

  return results[0].avatar
}

/**
 * Получение настроек микроблога пользователя
 *
 * @param {number} userId ID пользователя
 *
 * @returns {object}
 */
async function getMicroblogSettings (userId) {
  const connection = await pool.getConnection()

  // eslint-disable-next-line no-unused-vars
  const [results, _fields] = await connection.query(
    'SELECT `user`.`microblog_settings` FROM `user` ' +
    'WHERE `user`.`id` = ? ' +
    'LIMIT 1',
    [userId]
  )

  pool.releaseConnection(connection)

  if (results.length === 0) {
    throw new Error('no avatar found')
  }

  return JSON.parse(results[0].microblog_settings)
}

module.exports = {
  getUserIdViaCredentials,
  getContact,
  getContactGroups,
  getContactsFromGroups,
  createOrCompleteContact,
  addContactMSG,
  createNewGroup,
  searchUsers,
  getIdViaLogin,
  modifyGroupName,
  deleteGroup,
  modifyContact,
  deleteContact,
  modifyUserStatus,
  isContactAuthorized,
  isContactAdder,
  getOfflineMessages,
  cleanupOfflineMessages,
  sendOfflineMessage,
  getUserAvatar,
  registerUser,
  checkUser,
  getMicroblogSettings
}
