class BinaryReader {
  constructor(buffer, endianness = BinaryEndianness.LITTLE) {
    this.buffer = buffer;
    this.offset = 0;
    this.endianness = endianness;
  }

  readInt8() {
    const value = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint8() {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16() {
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readUint32() {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readInt16() {
    const value = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt32() {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readUint8Array(size) {
    const value = this.buffer.slice(this.offset, this.offset + size);
    this.offset += size;
    return [...value];
  }

  readArrayAsString(size) {
    const bytes = this.readUint8Array(size);
    return Buffer.from(bytes).toString('ascii');
  }
}

// Поддержка endianness
const BinaryEndianness = {
  LITTLE: 'little',
  BIG: 'big',
  NETWORK: 'big' // NETWORK соответствует big-endian
};

module.exports = { BinaryReader, BinaryEndianness };
