// Настройки базы данных
const database = {
  connectionUri: 'mysql://localhost:3306/mrimdb'
}

// Настройки MRIM-сервера
const mrim = {
  enabled: true,
  serverHostname: '127.0.0.1',
  serverPort: 2041
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

// Настройки REST API
const rest = {
  enabled: true,
  serverHostname: '127.0.0.1', // оставьте localhost для безопасности
  serverPort: 1862
}

// Настройки профиля администратора
const adminProfile = {
  enabled: false,
  username: 'admin',
  nickname: 'Администрация',
  defaultMessage: "Привет! \n\nЭто служебный аккаунт данного MRIM-сервера. Отсюда будут приходить тебе важные уведомления о технических работах или обновлениях сервера. Если у вас есть вопросы, пожалуйста, свяжитесь с администратором сервера.\n\nПриятного общения!",
}

module.exports = { database, mrim, redirector, socks, obraz, rest, adminProfile }
