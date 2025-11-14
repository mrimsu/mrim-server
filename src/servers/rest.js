
const BinaryConstructor = require('../constructors/binary')
const { MrimMessageCommands } = require('./mrim/globals')
const { MrimNewEmail } = require('../messages/mrim/email')
const { MrimServerMessageData } = require('../messages/mrim/messaging')
const { MrimContainerHeader } = require('../messages/mrim/container');
const { checkUser, registerUser, createNewGroup } = require('../database');

const { adminProfile } = require('../../config');

const express = require('express');

const RESTserver = express();
RESTserver.use(express.json());

RESTserver.get('/heartbeat', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// user interaction

RESTserver.get('/users/rawOnline', (req, res) => {
    res.json({ users: global.clients });
});

RESTserver.get('/users/online', (req, res) => {
    let response = [];

    for (const clientId in global.clients) {
    const client = global.clients[clientId];
    response.push({
        userId: client.userId,
        username: client.username,
        status: client.status,
        userAgent: client.userAgent,
        protocolVersion: client.protocolVersionMinor
    });
    }

    res.json({ count: response.length, users: response });
});

RESTserver.get('/users/status', (req, res) => {
 const { user } = req.query;  
  if (!user) {
        return res.status(400).json({ error: 'User parameter is required' });
 }
 
 const client = global.clients.find(client => client.username === user)
if (!client) {
  return res.status(404).json({ error: 'User is offine or not found' });
 }
 res.status(200).json({
  username: client.username,
  status: client.status,
 });
});
  
  else
   res.json({ response });
});

RESTserver.post('/users/announce', (req, res) => {
    if (!adminProfile.enabled) {
        return res.status(400).json({ error: 'Admin profile is not enabled and/or configured' });
    }

    let message = req.body.message;
    if (!message) {
        return res.status(400).json({ error: 'Message body parameter is required' });
    }

    for (const clientId in global.clients) {
        const client = global.clients[clientId];

        const messagePacket = MrimServerMessageData.writer({
            id: Math.random() * 0xFFFFFFFF,
            flags: 0x00000040, // system message
            addresser: adminProfile.username + "@mail.ru",
            message: message,
            messageRTF: "",
        }, client.utf16capable);

        const buffer = new BinaryConstructor()
        .subbuffer(
            MrimContainerHeader.writer({
                protocolVersionMajor: client.protocolVersionMajor,
                protocolVersionMinor: client.protocolVersionMinor,
                packetOrder: Math.random() * 0xFFFFFFFF,
                packetCommand: MrimMessageCommands.MESSAGE_ACK,
                dataSize: messagePacket.length,
            }, client.utf16capable)
        )
        .subbuffer(messagePacket)
        .finish()

        client.socket.write(buffer)
    }

  res.json({ status: 'ok', users: global.clients.length });
});

RESTserver.post('/users/sendMailToAll', (req, res) => {
    let message = req.body.message;
    if (!message) {
        return res.status(400).json({ error: 'Message body parameter is required' });
    }

    const emailPacket = MrimNewEmail.writer({
        email_count: 1,
        from: "admin@mrim.su",
        title: message,
        unix_time: Math.floor(Date.now() / 1000)
    });

    for (const clientId in global.clients) {
        const client = global.clients[clientId];

        const buffer = new BinaryConstructor()
        .subbuffer(
            MrimContainerHeader.writer({
                protocolVersionMajor: client.protocolVersionMajor,
                protocolVersionMinor: client.protocolVersionMinor,
                packetOrder: 0,
                packetCommand: MrimMessageCommands.NEW_MAIL,
                dataSize: emailPacket.length,
            }, client.utf16capable)
        )
        .subbuffer(emailPacket)
        .finish()

        client.socket.write(buffer)
    }

    res.json({ status: 'ok', users: global.clients.length });
});

RESTserver.put('/users/register', async (req, res) => {
    let { login, passwd, nick, f_name, l_name, location, birthday, sex, status } = req.body;

    if (!login || !passwd || !nick || !f_name || !sex) {
        return res.status(400).json({ error: 'Required fields: login, passwd, nick, f_name, sex' });
    }

    if (await checkUser(login) === true) {
        return res.status(400).json({ error: 'User with this login already exists' });
    }

    sex = parseInt(sex);
    if (sex !== 2 && sex !== 1) {
        return res.status(400).json({ error: 'Field "sex" is incorrect: must be 0 or 1' });
    }

    if (birthday) {
        const re = new RegExp(/([0-9]{4})\-([0-9]{2})\-([0-9]{2})/g, "i");
        const regexResult = re.exec(birthday)

        if (parseInt(regexResult[2]) > 12) {
            return res.status(400).json({ error: 'Field "birthday" is incorrect: month is invalid' });
        }

        if (parseInt(regexResult[3]) > 31) {
            return res.status(400).json({ error: 'Field "birthday" is incorrect: day is invalid' });
        }

        if (!re.test(birthday)) {
            return res.status(400).json({ error: 'Field "birthday" is incorrect: must be in format YYYY-MM-DD' });
        }
    }

    const userId = await registerUser({
        login,
        passwd,
        nick,
        f_name,
        l_name,
        location,
        birthday,
        sex,
        status
    });

    if (!userId) {
        return res.status(500).json({ error: 'Internal error' });
    }

    await createNewGroup(userId, 'Основное')

    res.json({ status: 'ok' });
});

module.exports = RESTserver;
