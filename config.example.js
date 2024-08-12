// Настройки базы данных
const database = {
  connectionUri: 'mysql://localhost:3306/mrimdb'
}

// Настройки MRIM-сервера
const mrim = {
  enabled: true,
  serverHostname: '127.0.0.1',
  serverPort: 2041,
  pingTimer: 5, // in seconds
}

// Настройки сервера-перенаправлятора
const redirector = {
  enabled: true,
  serverHostname: '127.0.0.1',
  serverPort: 2042,
  redirectTo: '127.0.0.1:2041'
}

// Настройки SOCKS5 проски-сервера
const socks = {
  enabled: true,
  serverHostname: '127.0.0.1',
  serverPort: 8080
}

// Настройки сервер образов
const obraz = {
  enabled: true,
  customHost: 'localhost:8081', // опционально
  serverPort: 8081,
  serverHostname: '0.0.0.0'
}

module.exports = { database, mrim, redirector, socks, obraz }
