/**
 * @file Реализация конструктора сообщения
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { BinaryReader, BinaryEndianness } = require('@glagan/binary-reader')
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
  INT16: 4,
  INT32: 5,
  SUBBUFFER: 6,
  BYTE_ARRAY: 7,
  UBIART_LIKE_STRING: 8 // прошлое с Just Dance моя до сих пор не отпускает
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
   *
   * @returns {MessageConstructor} Возвращает себя
   */
  field (key, dataType, constantValue, subbufferSize) {
    this.fields.push({ key, dataType, constantValue, subbufferSize })
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
    return (message) => {
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
            console.log(field.key, message[field.key])
            binaryConstructor = binaryConstructor.integer(
              field.constantValue ?? message[field.key],
              4
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
            const valueBinary = new Iconv('UTF-8', 'CP1251').convert(value)

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
    return (message) => {
      const binaryReader = new BinaryReader(message, this.endianness)
      const result = {}

      for (const field of this.fields) {
        if (field.customReader !== undefined) {
          result[field.key] = field.customReader(binaryReader)
          continue
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
        }
      }

      return result
    }
  }
}

module.exports = { MessageConstructor, FieldDataType }
