/**
 * @file Реализация SMS
 * @author Neru Asano <neru.asano9667@gmail.com>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { MrimMessageCommands } = require('../globals')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const { MrimCsSms, MrimCsSmsAck, MrimSmsStatus } = require('../../../messages/mrim/sms')
const { getTelegramIdByVirtualNumber } = require('../../../database')
const config = require('../../../../config')
const { _checkIfLoggedIn } = require('./core')

async function processSms (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if (await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const sms = MrimCsSms.reader(packetData, state.utf16capable)
  let status = MrimSmsStatus.OK

  const virtualNumber = sms.phone.replace(/\D/g, '')
  const messageWithMail = `${state.username}@${state.domain}: ` + sms.message

  let numberData;
  try {
    numberData = await getTelegramIdByVirtualNumber(virtualNumber);
  } catch (e) {
    logger.error(`[${connectionId}] db error while resolving virtual number: ${e.stack}`);
  }

  if (!numberData) {
    logger.error(`[${connectionId}] telegram ID for virtual number +${virtualNumber} not found`);
    status = MrimSmsStatus.INVALID_PARAMS;
  } else if (numberData.inUse === '0') {
    logger.error(`[${connectionId}] the virtual number +${virtualNumber} is not in service. please call back later.`); // that one naehiro fanfic reference lol
    status = MrimSmsStatus.INVALID_PARAMS;
  }

  if (status === MrimSmsStatus.OK) {
    if (!config.telegram?.enabled) {
      logger.error(`[${connectionId}] ${state.username}@${state.domain} tried to send an SMS, but they are disabled. responding with SMS_SERVICE_UNAVAILABLE`)
      status = MrimSmsStatus.SERVICE_UNAVAILABLE
    } else {
      const targetChatId = numberData.telegramId;
      try {
        const response = await fetch(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetChatId, text: messageWithMail })
        });

        const responseData = await response.json();
        if (!response.ok || !responseData.ok) {
          logger.error(`[${connectionId}] telegram error for chat ID ${targetChatId}: ${responseData.description}`)
          status = responseData.error_code === 400 ? MrimSmsStatus.INVALID_PARAMS : MrimSmsStatus.SERVICE_UNAVAILABLE
        } else {
          logger.debug(`[${connectionId}] ${state.username}@${state.domain} sent an SMS to +${virtualNumber}`)
        }
      } catch (e) {
        logger.error(`[${connectionId}] telegram connection error: ${e.stack}`);
        status = MrimSmsStatus.SERVICE_UNAVAILABLE;
      }
    }
  }

  const smsAckUpdate = MrimCsSmsAck.writer({ status })
  return {
    reply:
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.SMS_ACK,
            dataSize: smsAckUpdate.length
          })
        )
        .subbuffer(smsAckUpdate)
        .finish()
  }
}

module.exports = { processSms }