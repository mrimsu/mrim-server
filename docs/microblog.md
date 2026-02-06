# Интеграция Микроблога

Перед началом нужно импортировать [следующее](/install/updates/00003-microblog.sql) в базу данных сервера. Затем, в таблице `user` для нужного пользователя заполните поле `microblog_settings` следующим JSON-объектом:

`{"type":"openvk","instance":"ovk.to","userId":"0","token":"example"}` - Пример с OpenVK

---

### Параметры

- `type` - Платформа для публикации микропостов.

Доступны следующие платформы:
- `openvk`
- `telegram`

#### OpenVK

- `instance` - Инстанция OpenVK (без https://).
- `userId` - ID Пользователя. Найти свой ID можно [тут](https://ovk.to/settings).
- `token` - API токен OpenVK. Получить его можно [тут](https://docs.ovk.to/openvk_engine/api/authorization).

#### Telegram
Заметка: параметр `instance` не нужен для этой платформы.
- `chatId` - ID пользователя, группы, канала (для групп и каналов ID начинается с -).
- `token` - API токен бота Telegram. Получить его можно [тут](https://t.me/botfather).

Пример: `{"type":"telegram","chatId":"-123456789","token":"example"}`

---

Если вы хотите, чтобы микроблог остался только внутри MRIM — укажите `{}` заместо JSON объекта.
