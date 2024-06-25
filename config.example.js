// Настройки базы данных
const database = {
  connectionUri: 'mysql://localhost:3306/mrimdb'
}

// Настройки MRIM-сервера
const mrim = {
  serverHostname: '127.0.0.1',
  serverPort: 2041
}

// Настройки сервера-перенаправлятора
const redirector = {
  serverHostname: '127.0.0.1',
  serverPort: 2042,
  redirectTo: '127.0.0.1:2041'
}

// Настройки SOCKS5 проски-сервера
const socks = {
  serverHostname: '127.0.0.1',
  serverPort: 8080
}

module.exports = { database, mrim, redirector, socks }
