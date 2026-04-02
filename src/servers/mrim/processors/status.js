/**
 * @file Статусы и микроблоги пользователей
 * @author Vladimir Barinov <veselcraft@icloud.com>
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const BinaryConstructor = require('../../../constructors/binary')
const { MrimMessageCommands, MrimStatus, MrimContactFlags } = require('../globals')
const { MrimContainerHeader } = require('../../../messages/mrim/container')
const {
  MrimChangeStatusRequest,
  MrimChangeXStatusRequest,
  MrimUserStatusUpdate,
  MrimUserXStatusUpdate
} = require('../../../messages/mrim/status')
const { MrimChangeMicroblogStatus, MrimMicroblogStatus } = require('../../../messages/mrim/microblog')
const {
  getContactsFromGroups,
  getMicroblogSettings,
  insertNewMicroblog
} = require('../../../database')
const { _checkIfLoggedIn } = require('./core')

async function processChangeStatus (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  let status

  if (containerHeader.protocolVersionMinor >= 15) {
    // костыль для азербайджанской разработки
    if (state.clientName === 'QIP Infium') {
      status = MrimChangeXStatusRequest.reader(packetData, true)
    } else {
      status = MrimChangeXStatusRequest.reader(packetData, state.utf16capable)
    }
  } else {
    status = MrimChangeStatusRequest.reader(packetData)
  }

  state.status = status.status

  if (status.status === 0x4) {
    state.xstatus.type = status.xstatusType
    state.xstatus.title = status.xstatusTitle
    state.xstatus.description = status.xstatusDescription
  }

  logger.debug(`[${connectionId}] new status for ${state.username}@${state.domain} -> ${status.status} / X-status: ${status.xstatusTitle ?? ''} (${status.xstatusDescription ?? ''})`)

  const contacts = await getContactsFromGroups(state.userId)

  for (const contact of contacts) {
    const client = global.clients.find(
      ({ userId }) => userId === contact.user_id
    )

    if (client === undefined) {
      continue
    }

    if (contact.is_auth_success === 0) {
      continue
    }

    // если статус невидимый
    const contactFlags = contact.requester_is_adder
      ? contact.contact_flags
      : contact.adder_flags

    if (status.status === MrimStatus.INVISIBLE &&
      (contactFlags & MrimContactFlags.NEVER_VISIBLE || contactFlags & MrimContactFlags.IGNORED)) {
      continue
    } else if (status.status === MrimStatus.INVISIBLE && !(contactFlags & MrimContactFlags.ALWAYS_VISIBLE)) {
      status.status = 0
      status.xstatusType = ''
      status.xstatusTitle = ''
      status.xstatusDescription = ''
    }

    let userStatusUpdate

    if (client.protocolVersionMinor >= 15) {
      userStatusUpdate = MrimUserXStatusUpdate.writer({
        status: status.status,
        xstatusType: status.xstatusType ?? '',
        xstatusTitle: status.xstatusTitle ?? '',
        xstatusDescription: status.xstatusDescription ?? '',
        features: state.features ?? 0x02FF,
        userAgent: state.userAgent ?? '',
        contact: `${state.username}@${state.domain}`
      }, client.utf16capable)
    } else {
      userStatusUpdate = MrimUserStatusUpdate.writer({
        status: status.status !== MrimStatus.XSTATUS ? status.status : MrimStatus.ONLINE,
        contact: `${state.username}@${state.domain}`
      })
    }

    client.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_STATUS,
            dataSize: userStatusUpdate.length
          })
        )
        .subbuffer(userStatusUpdate)
        .finish()
    )

    logger.debug(`[${connectionId}] 'll send ${state.username}@${state.domain}'s new status to ${contact.user_login}@${contact.user_domain}`)
  }
}

async function processNewMicroblog (
  containerHeader,
  packetData,
  connectionId,
  logger,
  state,
  variables
) {
  if(await _checkIfLoggedIn(containerHeader, logger, connectionId, state) === 0) return

  const microblog = MrimChangeMicroblogStatus.reader(packetData, state.utf16capable)

  let innerID = 0xFFFFFFFFFFFFFF

  if ([0x1, 0x9].includes(microblog.flags)) {
    const microblogSettings = await getMicroblogSettings(state.userId)
    let url = ''

    // openvk

    if (microblogSettings.type === 'openvk') {
      try {
        await fetch(`https://${microblogSettings.instance}/method/wall.post?` +
            `owner_id=${microblogSettings.userId}` +
            `&message=${encodeURIComponent(microblog.text)}` +
            `&access_token=${microblogSettings.token}`).then(response => response.json()).then(json => {
            if (json.error_code !== undefined) {
              logger.error(`[${connectionId}] failed to post to OpenVK: ${json.error_code} ${json.error_msg}`)
            } else {
              url = `https://${microblogSettings.instance}/wall${microblogSettings.userId}_${json.response.post_id}`
              logger.debug(`[${connectionId}] posted to OpenVK: ${url}`)
            }
        })
      } catch (e) {
        logger.error(`[${connectionId}] failed to post to OpenVK: ${e.stack}`)
      }
    }

    innerID = insertNewMicroblog(state.userId, microblog.text, url)
  }

  state.microblog = {
    id: innerID,
    text: microblog.text,
    date: Math.floor(Date.now() / 1000)
  }

  logger.debug(`[${connectionId}] new microblog post from ${state.username}@${state.domain} -> ${microblog.text}`)

    const userMicroblogUpdate = MrimMicroblogStatus.writer({
      flags: microblog.flags,
      contact: `${state.username}@${state.domain}`,
      text: microblog.text,
      id: innerID,
      time: Math.floor(Date.now() / 1000)
    }, true)

  const contacts = await getContactsFromGroups(state.userId)

  for (const contact of contacts) {
    const client = global.clients.find(
      ({ userId }) => userId === contact.user_id
    )

    if (client === undefined) {
      continue
    }

    if (contact.is_auth_success === 0) {
      continue
    }

    if (client.protocolVersionMinor < 20) {
      continue
    }

    // если статус невидимый
    const contactFlags = contact.requester_is_adder
      ? contact.contact_flags
      : contact.adder_flags

    if (contactFlags & MrimContactFlags.NEVER_VISIBLE || contactFlags & MrimContactFlags.IGNORED) {
      continue
    }

    client.socket.write(
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_BLOG_STATUS,
            dataSize: userMicroblogUpdate.length
          })
        )
        .subbuffer(userMicroblogUpdate)
        .finish()
    )

    logger.debug(`[${connectionId}] 'll send ${state.username}@${state.domain}'s new microblog post to ${contact.user_login}@${contact.user_domain}`)
  }

  return {
    reply:
      new BinaryConstructor()
        .subbuffer(
          MrimContainerHeader.writer({
            ...containerHeader,
            packetCommand: MrimMessageCommands.USER_BLOG_STATUS,
            dataSize: userMicroblogUpdate.length
          })
        )
        .subbuffer(userMicroblogUpdate)
        .finish()
    }
}

module.exports = { processChangeStatus, processNewMicroblog }
