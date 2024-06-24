/**
 * @file Реализация MRIM-сервера.
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require("../constructors/binary");
const { ServerConstructor } = require("../constructors/server");
const { MrimLoginData } = require("../messages/mrim/authorization");
const { MrimContainerHeader } = require("../messages/mrim/container");

const MrimMessageCommands = {
  HELLO: 0x1001,
  HELLO_ACK: 0x1002,
  LOGIN_ACK: 0x1004,
  LOGIN_REJ: 0x1005,
  PING: 0x1006,
  LOGIN2: 0x1038,
};

const MRIM_HEADER_CONTAINER_SIZE = 0x2c;

function onConnection(socket, connectionId, logger, _variables) {
  socket.on("data", onData(socket, connectionId, logger));
}

function onData(socket, connectionId, logger) {
  return (data) => {
    const header = MrimContainerHeader.reader(data);

    logger.debug("===============================================");
    logger.debug(
      `Версия протокола: ${header.protocolVersionMajor}.${header.protocolVersionMinor}`,
    );
    logger.debug(`Последовательность пакета: ${header.packetOrder}`);
    logger.debug(`Команда данных: ${header.packetCommand}`);
    logger.debug(`Размер данных: ${header.dataSize}`);
    logger.debug("===============================================");

    const packetData = data.subarray(
      MRIM_HEADER_CONTAINER_SIZE,
      MRIM_HEADER_CONTAINER_SIZE + header.dataSize,
    );

    const result = processPacket(header, packetData, connectionId, logger);

    if (result === undefined) {
      return;
    }

    if (result.end === true) {
      socket.end(result.reply);
    } else {
      socket.write(result.reply);
    }
  };
}

function processPacket(containerHeader, packetData, connectionId, logger) {
  switch (containerHeader.packetCommand) {
    case MrimMessageCommands.HELLO: {
      logger.debug(
        `[${connectionId}] От клиента пакет определён как MRIM_CS_HELLO`,
      );
      logger.debug(`[${connectionId}] Отправляем MRIM_CS_HELLO_ACK...`);

      const containerHeaderBinary = MrimContainerHeader.writer({
        ...containerHeader,
        packetOrder: 0,
        packetCommand: MrimMessageCommands.HELLO_ACK,
        dataSize: 0x4,
        senderAddress: 0,
        senderPort: 0,
      });

      return {
        reply: new BinaryConstructor()
          .subbuffer(containerHeaderBinary)
          .integer(10, 4)
          .finish(),
      };
    }
    case MrimMessageCommands.LOGIN2: {
      logger.debug(
        `[${connectionId}] От клиента пакет определён как MRIM_CS_LOGIN2`,
      );
      logger.debug(`[${connectionId}] Временно отправляем MRIM_CS_LOGIN_ACK`);

      const loginData = MrimLoginData.reader(packetData);

      logger.debug("!! Вход в аккаунт !!");
      logger.debug(`ID подключения: ${connectionId}`);
      logger.debug(`Логин: ${loginData.login}`);
      logger.debug(`Пароль: ${loginData.password}`);
      logger.debug(`Статус: ${loginData.status}`);
      logger.debug(`Юзерагент: ${loginData.userAgent}`);

      return {
        reply: MrimContainerHeader.writer({
          ...containerHeader,
          dataType: MrimMessageCommands.LOGIN_ACK,
          dataSize: 0,
          senderAddress: 0,
          senderPort: 0,
        }),
      };
    }
    case MrimMessageCommands.PING: {
      logger.debug(`[${connectionId}] От клиента прилетел пинг. Игнорируем`);
      break;
    }
  }
}

// TODO mikhail переписать на STEP_BY_STEP
function createMrimServer(options) {
  return new ServerConstructor({
    logger: options.logger,
    onConnection,
  }).finish();
}

module.exports = createMrimServer;
