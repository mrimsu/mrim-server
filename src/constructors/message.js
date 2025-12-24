/**
 * @file Реализация конструктора сообщения
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { BinaryReader, BinaryEndianness } = require('../binary-reader')
const { strict: assert } = require('node:assert')
const { Iconv } = require('iconv')
const BinaryConstructor = require('./binary')

/**
 * Тип данных поля
 *
 * @enum {number}
 * @readonly
 */
const FieldDataType = {
  BYTE: 1,
  UINT16: 2,
  UINT32: 3,
  UINT64: 10,
  INT16: 4,
  INT32: 5,
  SUBBUFFER: 6,
  BYTE_ARRAY: 7,
  UBIART_LIKE_STRING: 8, // прошлое с Just Dance меня до сих пор не отпускает,
  UNICODE_STRING: 9 // типа пользовательные данные
}

class MessageConstructor {
  constructor (endianness) {
    this.fields = []
    this.endianness = endianness ?? BinaryEndianness.LITTLE
  }

  /**
   * Добавление поля.
   *
   * @param {string} key Ключ/имя поля.
   * @param {FieldDataType} dataType Тип данных поля.
   * @param {any?} constantValue Константное значение
   * @param {number?} subbufferSize Размер суббуфера
   * @param {number?} maxSize Максимальный размер строки (только для UBIART_LIKE_STRING и UNICODE_STRING)
   *
   * @returns {MessageConstructor} Возвращает себя
   */
  field (key, dataType, constantValue, subbufferSize, maxSize) {
    this.fields.push({ key, dataType, constantValue, subbufferSize, maxSize })
    return this
  }

  /**
   * Добавление поля.
   *
   * @param {string} key Ключ/имя поля.
   * @param {CallableFunction} customWriter Специальный писатель
   * @param {CallableFunction} customReader Специальный читатель
   *
   * @returns {MessageConstructor} Возвращает себя
   */
  fieldWithCustomHandlers (key, customWriter, customReader) {
    this.fields.push({ key, customWriter, customReader })
    return this
  }

  /**
   * Закончить сообщение.
   * @returns {Object} Объект с writer и reader функциями
   */
  finish () {
    return {
      writer: this.generateWriter(),
      reader: this.generateReader()
    }
  }

  generateWriter () {
    return (message, utf16required = false) => {
      let binaryConstructor = new BinaryConstructor()

      for (const field of this.fields) {
        if (field.customWriter !== undefined) {
          binaryConstructor = field.customWriter(
            message[field.key],
            binaryConstructor
          )
          continue
        }

        switch (field.dataType) {
          case FieldDataType.BYTE:
            binaryConstructor = binaryConstructor.integer(
              field.constantValue ?? message[field.key],
              1
            )
            break
          case FieldDataType.UINT16:
            binaryConstructor = binaryConstructor.integer(
              field.constantValue ?? message[field.key],
              2
            )
            break
          case FieldDataType.UINT32:
            binaryConstructor = binaryConstructor.integer(
              field.constantValue ?? message[field.key],
              4
            )
            break
          case FieldDataType.UINT64:
            binaryConstructor = binaryConstructor.integer(
              field.constantValue ?? message[field.key],
              8
            )
            break
          case FieldDataType.INT16:
            binaryConstructor = binaryConstructor.integer(
              field.constantValue ?? message[field.key],
              2,
              true
            )
            break
          case FieldDataType.INT32:
            binaryConstructor = binaryConstructor.integer(
              field.constantValue ?? message[field.key],
              4,
              true
            )
            break
          case FieldDataType.SUBBUFFER:
            binaryConstructor = binaryConstructor.subbuffer(
              field.constantValue ?? message[field.key]
            )
            break
          case FieldDataType.BYTE_ARRAY: {
            const value = field.constantValue ?? message[field.key]

            binaryConstructor = binaryConstructor
              .integer(value.length, 4)
              .subbuffer(value)

            break
          }
          case FieldDataType.UBIART_LIKE_STRING: {
            const value = field.constantValue ?? message[field.key]
            const valueBinary = new Iconv('UTF-8', 'CP1251').convert(value ?? '')

            binaryConstructor = binaryConstructor
              .integer(valueBinary.length, 4)
              .subbuffer(valueBinary)

            break
          }
          case FieldDataType.UNICODE_STRING: {
            const value = field.constantValue ?? message[field.key]
            const valueBinary = new Iconv('UTF-8', utf16required ? 'UTF-16LE' : 'CP1251').convert(value ?? '')

            binaryConstructor = binaryConstructor
              .integer(valueBinary.length, 4)
              .subbuffer(valueBinary)

            break
          }
        }
      }

      return binaryConstructor.finish()
    }
  }

  generateReader () {
    return (message, utf16required = false) => {
      const binaryReader = new BinaryReader(message, this.endianness)
      const result = {}

      for (const field of this.fields) {
        if (field.customReader !== undefined) {
          result[field.key] = field.customReader(binaryReader)
          continue
        }

        if (binaryReader.offset >= message.length) {
          if (field.dataType === FieldDataType.UBIART_LIKE_STRING ||
            field.dataType === FieldDataType.UNICODE_STRING) {
            result[field.key] = ''
            continue
          } else {
            result[field.key] = 0
            continue
          }
        }

        switch (field.dataType) {
          case FieldDataType.BYTE: {
            result[field.key] = binaryReader.readInt8()

            assert(
              field.constantValue === undefined ||
                result[field.key] === field.constantValue,
              field.key
            )

            break
          }
          case FieldDataType.UINT16:
            result[field.key] = binaryReader.readUint16()

            assert(
              field.constantValue === undefined ||
                result[field.key] === field.constantValue
            )

            break
          case FieldDataType.UINT32:
            result[field.key] = binaryReader.readUint32()

            assert(
              field.constantValue === undefined ||
                result[field.key] === field.constantValue
            )

            break
          case FieldDataType.UINT64:
            const low = binaryReader.readUint32()
            const high = binaryReader.readUint32()

            result[field.key] = (BigInt(high) << 32n) | BigInt(low)

            assert(
              field.constantValue === undefined ||
                result[field.key] === field.constantValue
            )

            break
          case FieldDataType.INT16:
            result[field.key] = binaryReader.readInt16()

            assert(
              field.constantValue === undefined ||
                result[field.key] === field.constantValue
            )

            break
          case FieldDataType.INT32:
            result[field.key] = binaryReader.readInt32()

            assert(
              field.constantValue === undefined &&
                result[field.key] === field.constantValue
            )

            break
          case FieldDataType.SUBBUFFER:
            result[field.key] = Buffer.from(
              binaryReader.readUint8Array(field.subbufferSize)
            )

            break
          case FieldDataType.BYTE_ARRAY: {
            result[field.key] = Buffer.from(
              binaryReader.readUint8Array(binaryReader.readUint8())
            )

            break
          }
          case FieldDataType.UBIART_LIKE_STRING: {
            result[field.key] = new Iconv('CP1251', 'UTF-8')
              .convert(
                Buffer.from(
                  binaryReader.readUint8Array(binaryReader.readUint32())
                )
              )
              .toString('utf-8')

            break
          }
          case FieldDataType.UNICODE_STRING: {
            const length = binaryReader.readUint32()

            if (length > 0) {
              if (length % 2 !== 0) {
                // fallback to CP1251
                utf16required = false
              }
              result[field.key] = new Iconv(utf16required ? 'UTF-16LE' : 'CP1251', 'UTF-8')
                .convert(
                  Buffer.from(
                    binaryReader.readUint8Array(length)
                  )
                )
                .toString('utf-8')
                .slice(0, field.maxSize ?? 5000)
            } else {
              // Пустая строка
              result[field.key] = ''
            }

            break
          }
        }
      }

      return result
    }
  }
}

module.exports = { MessageConstructor, FieldDataType }
