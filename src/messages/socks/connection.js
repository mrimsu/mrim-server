/**
 * @file Сообщения подключения клиента/сервера SOCKS5.
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { BinaryEndianness } = require('@glagan/binary-reader')
const {
  MessageConstructor,
  FieldDataType
} = require('../../constructors/message')
const util = require('node:util')

const AddressType = { IPV4: 0x01, DOMAIN: 0x03 }

const SOCKS_VERSION = 0x05
const REVERSED_FIELD_VALUE = 0x00

const IPV4_ADDRESS_FORMAT = '%d.%d.%d.%d'

function writeDestinationAddress (data, binaryConstructor) {
  binaryConstructor = binaryConstructor.integer(data.type, 1)

  switch (data.type) {
    case AddressType.IPV4: {
      for (const entry of data.value.split('.')) {
        binaryConstructor = binaryConstructor.integer(parseInt(entry, 10), 1)
      }

      break
    }
    case AddressType.DOMAIN: {
      binaryConstructor = binaryConstructor
        .integer(data.value.length, 1)
        .subbuffer(Buffer.from(data.value, 'ascii'))

      break
    }
  }

  return binaryConstructor
}

function readDestinationAddress (binaryReader) {
  const type = binaryReader.readUint8()
  const result = { type }

  switch (type) {
    case AddressType.IPV4: {
      result.value = util.format(
        IPV4_ADDRESS_FORMAT,
        binaryReader.readUint8(),
        binaryReader.readUint8(),
        binaryReader.readUint8(),
        binaryReader.readUint8()
      )

      break
    }
    case AddressType.DOMAIN: {
      result.value = binaryReader.readArrayAsString(binaryReader.readUint8())

      break
    }
  }

  return result
}

const ClientConnectionMessage = new MessageConstructor(BinaryEndianness.NETWORK)
  .field('protocolVersion', FieldDataType.BYTE, SOCKS_VERSION)
  .field('connectionCommand', FieldDataType.BYTE)
  .field('reversedField', FieldDataType.BYTE, REVERSED_FIELD_VALUE)
  .fieldWithCustomHandlers(
    'destinationAddress',
    writeDestinationAddress,
    readDestinationAddress
  )
  .field('destinationPort', FieldDataType.UINT16)
  .finish()

const ServerConnectionMessage = new MessageConstructor(BinaryEndianness.NETWORK)
  .field('protocolVersion', FieldDataType.BYTE, SOCKS_VERSION)
  .field('connectionStatus', FieldDataType.BYTE)
  .field('reversedField', FieldDataType.BYTE, REVERSED_FIELD_VALUE)
  .fieldWithCustomHandlers(
    'destinationAddress',
    writeDestinationAddress,
    readDestinationAddress
  )
  .field('destinationPort', FieldDataType.UINT16)
  .finish()

module.exports = {
  ClientConnectionMessage,
  ServerConnectionMessage
}
