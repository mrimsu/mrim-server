
const BinaryConstructor = require('../constructors/binary')
const { MrimMessageCommands } = require('./mrim/globals')
const { MrimNewEmail } = require('../messages/mrim/email')
const { MrimServerMessageData } = require('../messages/mrim/messaging')
const { MrimContainerHeader } = require('../messages/mrim/container');

const { adminProfile } = require('../../config');

const express = require('express');

const RESTserver = express();
RESTserver.use(express.json());

RESTserver.get('/heartbeat', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// user interaction

RESTserver.get('/users/rawOnline', (req, res) => {
    res.json({ message: global.clients });
});

RESTserver.get('/users/online', (req, res) => {
    let response = [];

    for (const clientId in global.clients) {
    const client = global.clients[clientId];
    response.push({
        userId: client.userId,
        username: client.username,
        status: client.status,
        userAgent: client.userAgent
    });
    }

    res.json({ count: response.length, users: response });
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
                packetOrder: 0,
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

module.exports = RESTserver;
