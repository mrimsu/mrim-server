#!/usr/bin/env node
import mysql from 'mysql2/promise';
import crypto from 'crypto';

// Настройки подключения к MariaDB
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'your_password_here', // ← замени на свой пароль
  database: 'mrimdb',
  port: 3306
};

// Хэширование пароля
function hashPassword(pass) {
  return crypto.createHash('md5').update(pass).digest('hex');
}

// Подключение к БД
async function connectDB() {
  return await mysql.createConnection(dbConfig);
}

// CLI-обработчик
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const params = Object.fromEntries(
    args.map(a => a.split('=').map(s => s.replace(/^--/, '')))
  );

  const conn = await connectDB();

  try {
    switch (cmd) {
      case 'add': {
        if (!params.login || !params.passwd) {
          console.log('Ошибка: укажите --login и --passwd');
          break;
        }

        // Проверим, не существует ли пользователь
        const [exists] = await conn.execute('SELECT id FROM user WHERE login = ?', [params.login]);
        if (exists.length > 0) {
          console.log(`Пользователь ${params.login} уже существует (id=${exists[0].id})`);
          break;
        }

        const passwdHash = hashPassword(params.passwd);
        const [result] = await conn.execute(
          `INSERT INTO user (login, passwd, nick, f_name, l_name, location, birthday, zodiac, phone, sex, status, avatar)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            params.login,
            passwdHash,
            params.nick || params.login,
            params.f_name || null,
            params.l_name || null,
            params.location || null,
            params.birthday || null,
            params.zodiac || null,
            params.phone || null,
            params.sex || '1',
            params.status || 1,
            params.avatar || null
          ]
        );
        console.log(`Пользователь ${params.login} создан (ID: ${result.insertId})`);
        break;
      }

      case 'edit': {
        if (!params.id) {
          console.log('Ошибка: укажите --id');
          break;
        }
        const id = params.id;
        delete params.id;
        if (params.passwd) params.passwd = hashPassword(params.passwd);

        const fields = Object.keys(params)
          .map(k => `${k} = ?`)
          .join(', ');
        const values = Object.values(params);
        values.push(id);

        await conn.execute(`UPDATE user SET ${fields} WHERE id = ?`, values);
        console.log(`Пользователь #${id} обновлён`);
        break;
      }

      case 'delete': {
        if (!params.id) {
          console.log('Ошибка: укажите --id');
          break;
        }
        await conn.execute('DELETE FROM user WHERE id = ?', [params.id]);
        console.log(`Пользователь #${params.id} удалён`);
        break;
      }

      case 'list': {
        const [rows] = await conn.execute(
          'SELECT id, login, nick, status FROM user ORDER BY id'
        );
        console.table(rows);
        break;
      }

      default:
        console.log(`Использование:
  node user.js add --login=user --passwd=1234 [--nick=Nick] [--status=1]
  node user.js edit --id=5 --nick=NewNick [--passwd=newpass]
  node user.js delete --id=5
  node user.js list`);
    }
  } catch (err) {
    console.error('Ошибка:', err.message);
  } finally {
    await conn.end();
  }
}

main();
