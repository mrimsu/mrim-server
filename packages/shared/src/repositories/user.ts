import crypto from 'node:crypto';
import { RowDataPacket } from 'mysql2';
import { Repository } from './base.js';

export interface User {
  id: number
  login: string
  passwd: string
  nick: string | null
  f_name: string | null
  l_name: string | null
  location: string | null
  birthday: Date | null
  phone: string | null
  sex: '1' | '2' | null
  status: number
  avatar: string | null
}

export interface SearchParameters {
  login?: string
  nickname?: string
  firstName?: string
  lastName?: string
  minimumAge?: number
  maximumAge?: number
  zodiac?: number
  birthMonth?: number
  birthDay?: number;
  onlyOnline?: boolean;
}

export class UserRepository extends Repository {
  async fetchWithCredentials (login: string, password?: string): Promise<User> {
    const connection = await this.pool.getConnection();

    if (typeof password === 'string') {
      password = crypto.createHash('md5').update(password).digest('hex')
    }


    const [results, ] = await connection.query<RowDataPacket[]>(
      `
      SELECT * FROM \`user\`
      WHERE \`user\`.\`login\` = ?
      ${password ? 'AND `user`.`passwd` = ?' : ''}
      `,
      password ? [login, password] : [login]
    )

    if (results.length === 0) {
      throw new Error(
        password
          ? 'Пользователь не найден, либо пароль неверен.'
          : 'Пользователь не найден.'
      )
    }

    this.pool.releaseConnection(connection);
    return results.at(-1) as User;
  }

  async fetchWithId (id: number): Promise<User> {
    const connection = await this.pool.getConnection();

    const [results, ] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM `user` WHERE `user`.`id` = ?', [id]
    )

    if (results.length === 0) {
      throw new Error('Пользователь не найден.')
    }

    this.pool.releaseConnection(connection);
    return results.at(-1) as User;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateSearchQuery (params: SearchParameters, requesterId?: number): { query: string, variables: any } {
    const query = `
    SELECT *
    FROM \`user\`
    WHERE ${
      // ID пользователя, который ищет
      requesterId !== undefined
        ? '`user`.`.id` != ? AND'
        : ''
    } ${
      // Логин пользователя, которого необходимо найти
      params.login !== undefined
        ? '`user`.`login` = ? AND'
        : ''
    } ${
      // Псевдоним пользователя, которого необходимо найти
      params.nickname !== undefined
        ? '`user`.`nick` = ? AND'
        : ''
    } ${
      // Реальное имя пользователя, которого необходимо найти
      params.firstName !== undefined
        ? '`user`.`f_name` LIKE ? AND'
        : ''
    } ${
      // Фамилия пользователя, которого необходимо найти
      params.lastName !== undefined
        ? '`user`.`l_name` LIKE ? AND'
        : ''
    } ${
      // Возраст пользователя, которого необходимо найти
      params.minimumAge !== undefined && params.maximumAge !== undefined
        ? 'YEAR(CURDATE()) - YEAR(`user`.`birthday`) BETWEEN ? AND ? AND '
        // Если минимального/максимального возраста нет, то
        // поиск ищет без диапазона
        : params.minimumAge !== undefined && params.maximumAge === undefined
          ? 'YEAR(CURDATE()) - YEAR(`user`.`birthday`) >= ? AND '
          : params.minimumAge === undefined && params.maximumAge !== undefined
            ? 'YEAR(CURDATE()) - YEAR(`user`.`birthday`) <= ? AND '
            : ''
    } ${
      // Знак зодиака пользователя, которого необходимо найти
      params.zodiac !== undefined
        ? '`user`.`zodiac` = ? AND'
        : ''
    } ${
      // Месяц рождения пользователя, которого необходимо найти
      params.birthMonth !== undefined
        ? 'MONTH(`user`.`birthday`) = ? AND'
        : ''
    } ${
      // Число рождения пользователя, которого необходимо найти
      params.birthDay !== undefined
        ? 'DAY(`user`.`birthday`) = ? AND'
        : ''
    } ${
      // Необходимость в том, чтобы пользователь был сейчас в сети
      params.onlyOnline !== false || params.onlyOnline !== undefined
        ? '`user`.`status` = 1'
        : ''
    }
    `

    const variables = [
      ...(requesterId !== undefined ? [requesterId] : []),
      ...(params.login !== undefined ? [params.login] : []),
      ...(params.nickname !== undefined ? [params.nickname] : []),
      ...(params.firstName !== undefined ? [params.firstName] : []),
      ...(params.lastName !== undefined ? [params.lastName] : []),
      ...(
        params.minimumAge !== undefined && params.maximumAge !== undefined
        ? [params.minimumAge, params.maximumAge + 1]
        : params.minimumAge !== undefined && params.maximumAge === undefined
          ? [params.minimumAge]
          : params.minimumAge === undefined && params.maximumAge !== undefined
            ? [params.maximumAge + 1]
            : []
      ),
      ...(params.zodiac !== undefined ? [params.zodiac] : []),
      ...(params.birthMonth !== undefined ? [params.birthMonth] : []),
      ...(params.birthDay !== undefined ? [params.birthDay] : []),
    ]

    return {
      query:
        query.endsWith('AND')
          ? query.substring(0, query.length - 4)
          : query,
      variables,
    }
  }

  async search (params: SearchParameters, requesterId?: number): Promise<User[]> {
    if (Object.keys(params).length === 0) {
      throw new Error('Параметры поиска пусты.')
    }

    const connection = await this.pool.getConnection()

    const { query, variables } = this.generateSearchQuery(params, requesterId)
    console.log(query, variables)

    const [results, ] = await connection.query(query, variables)

    this.pool.releaseConnection(connection)
    return results as User[]
  }
}
