# Интеграция Микроблога

Перед началом нужно импротировать [следующее](/install/updates/00003-microblog.sql) в базу данных сервера. Далее, в столбец `microblog_settings` указать JSON объект:
`{"type":"openvk","instance":"ovk.to","userId":"0","token":"example"}`

### Параметры

- `type` - Платформа куда будут поститься ваши микропосты (пока что только OpenVK).
- `instance` - Инстанция OpenVK (без https://).
- `userId` - ID Пользователя.
- `token` - Токен API OpenVK. Получить его можно [тут](https://docs.ovk.to/openvk_engine/api/authorization).

Если вы хотите чтобы микроблог остался только внутри MRIM, укажите `{}` заместо JSON объекта.
