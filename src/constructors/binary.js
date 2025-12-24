/**
 * @file Реализация конструктора бинарных буферов
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const { BinaryEndianness } = require('../binary-reader')

class BinaryConstructor {
  constructor (endianness) {
    this.buffer = Buffer.alloc(0)
    this.endianness = endianness ?? BinaryEndianness.LITTLE
  }

  /**
   * Добавление целого числа в элементы
   *
   * @param {number} value Значение (число)
   * @param {number} size Размер в байтах (int8 = 1, int16 = 2, int32 = 4, int64 = 8)
   * @param {boolean} signed Знаковое или нет?
   *
   * @returns {BinaryConstructor} Возвращает себя
   */
  integer (value, size, signed = false) {
    let rawInteger = Buffer.alloc(size, 0x0)

    if (signed) {
      if (size > 4) { // если 64 бит
        rawInteger.writeInt32LE(value >> 8, 0); // верхний
        rawInteger.writeInt32LE(value & 0x00ff, 4); // нижний
      } else {
        rawInteger.writeIntLE(value, 0, size)
      }
    } else {
      if (size > 4) { // если 64 бит
        rawInteger.writeUInt32LE(value >> 8, 0); // верхний
        rawInteger.writeUInt32LE(value & 0x00ff, 4); // нижний
      } else {
        rawInteger.writeUIntLE(value, 0, size)
      }
    }

    if (this.endianness !== BinaryEndianness.LITTLE) {
      rawInteger = rawInteger.reverse()
    }

    return this.subbuffer(rawInteger)
  }

  /**
   * Добавление суббуфера
   *
   * @param {Buffer} subbuffer Суббуфер
   * @returns {BinaryConstructor} Возвращает себя
   */
  subbuffer (subbuffer) {
    this.buffer = Buffer.concat([this.buffer, subbuffer])
    return this
  }

  /**
   * Закрыть буфер
   * @returns {Buffer} Финальный буфер
   */
  finish () {
    return this.buffer
  }
}

module.exports = BinaryConstructor
