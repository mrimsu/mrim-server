# Интеграция Микроблога

Перед началом нужно импортировать [следующее](/install/updates/00003-microblog.sql) в базу данных сервера. Затем, в таблице `user` для нужного пользователя заполните поле `microblog_settings` следующим JSON-объектом:
`{"type":"openvk","instance":"ovk.to","userId":"0","token":"example"}`

### Параметры

- `type` - Платформа для публикации микропостов (пока что только OpenVK).
- `instance` - Инстанция OpenVK (без https://).
- `userId` - ID Пользователя.
- `token` - API токен OpenVK. Получить его можно [тут](https://docs.ovk.to/openvk_engine/api/authorization).

Если вы хотите чтобы микроблог остался только внутри MRIM, укажите `{}` заместо JSON объекта.
