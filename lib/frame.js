const crypto = require('bare-crypto')
const errors = require('./errors')

const EMPTY = Buffer.alloc(0)

const FIN = 0b10000000
const RSV1 = 0b01000000
const RSV2 = 0b00100000
const RSV3 = 0b00010000
const OPCODE = 0b00001111
const MASK = 0b10000000
const LENGTH = 0b01111111

// https://datatracker.ietf.org/doc/html/rfc6455#section-5
module.exports = exports = class Frame {
  constructor(opcode, payload = EMPTY, opts = {}) {
    if (payload && !Buffer.isBuffer(payload)) {
      opts = payload
      payload = EMPTY
    }

    const {
      fin = true,
      rsv1 = false,
      rsv2 = false,
      rsv3 = false,
      mask = null
    } = opts

    this.fin = fin
    this.rsv1 = rsv1
    this.rsv2 = rsv2
    this.rsv3 = rsv3
    this.opcode = opcode
    this.mask = mask
    this.payload = payload
  }

  toBuffer() {
    const state = { start: 0, end: 0, buffer: null }

    Frame.preencode(state, this)

    state.buffer = Buffer.allocUnsafe(state.end)

    Frame.encode(state, this)

    return state.buffer
  }
}

const Frame = exports

exports.preencode = function preencode(state, f) {
  let i = state.end

  i++

  const length = f.payload.length

  if (length <= 0x7d) i++
  else {
    if (length <= 0xffff) i += 3
    else i += 9
  }

  if (f.mask) i += 4

  i += length

  state.end = i
}

exports.encode = function encode(state, f) {
  const b = state.buffer

  let i = state.start

  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)

  b[i] = f.opcode & OPCODE

  if (f.fin) b[i] |= FIN
  if (f.rsv1) b[i] |= RSV1
  if (f.rsv1) b[i] |= RSV2
  if (f.rsv1) b[i] |= RSV3

  i++

  b[i] = f.mask ? MASK : 0

  const length = f.payload.length

  if (length <= 0x7d) b[i++] |= length
  else {
    if (length <= 0xffff) {
      b[i++] |= 0x7e

      v.setUint16(i, length, false)

      i += 2
    } else {
      b[i++] |= 0x7f

      const high = Math.floor(length / 0x100000000)

      v.setUint16(i, high, false)

      i += 4

      const low = length & 0xffffffff

      v.setUint16(i, low, false)

      i += 4
    }
  }

  if (f.mask) {
    crypto.randomFill(f.mask, 0, 4)

    b.set(f.mask, i)

    i += 4

    for (let j = 0; j < length; j++) {
      b[i + j] = f.payload[j] ^ f.mask[j & 3]
    }
  } else {
    b.set(f.payload, i)
  }

  i += length

  state.start = i
}

exports.decode = function decode(state) {
  const b = state.buffer

  let i = state.start
  let n = b.length

  if (n < 2) return null

  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)

  const fin = !!(b[i] & FIN)

  const rsv1 = !!(b[i] & RSV1)
  const rsv2 = !!(b[i] & RSV2)
  const rsv3 = !!(b[i] & RSV3)

  const opcode = b[i] & OPCODE

  i++
  n--

  const masked = !!(b[i] & MASK)

  let length = b[i] & LENGTH

  i++
  n--

  if (length === 0x7e) {
    if (n < 2) return null

    length = view.getUint16(i, false)

    i += 2
    n -= 2
  } else if (length === 0x7f) {
    if (n < 8) return null

    const high = view.getUint32(i, false)

    if (high >= 0x200000) throw errors.INVALID_PAYLOAD_LENGTH()

    i += 4
    n -= 4

    const low = view.getUint32(i, false)

    i += 4
    n -= 4

    length = high * 0x100000000 + low
  }

  let mask = null

  if (masked) {
    if (n < 4) return null

    mask = b.subarray(i, i + 4)

    i += 4
    n -= 4
  }

  if (n < length) return null

  const payload = b.subarray(i, i + length)

  i += length
  n -= length

  if (mask) {
    for (let i = 0; i < length; i++) {
      payload[i] ^= mask[i & 3]
    }
  }

  state.start = i

  return new Frame(opcode, payload, { fin, rsv1, rsv2, rsv3, mask })
}
