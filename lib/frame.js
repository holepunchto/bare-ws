const crypto = require('bare-crypto')
const { opcode, MAX_CONTROL_PAYLOAD_LENGTH, MAX_PAYLOAD_LENGTH } = require('./constants')
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

    const { fin = true, rsv1 = false, rsv2 = false, rsv3 = false, mask = null } = opts

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
  if (f.rsv2) b[i] |= RSV2
  if (f.rsv3) b[i] |= RSV3

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

      v.setUint32(i, high, false)

      i += 4

      const low = length & 0xffffffff

      v.setUint32(i, low, false)

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

exports.decode = function decode(state, opts = {}) {
  const { maxPayload = MAX_PAYLOAD_LENGTH } = opts

  const s = state.start
  const b = state.buffer

  const end = typeof state.end === 'number' && state.end < b.byteLength ? state.end : b.byteLength

  let i = s

  if (end - i < 2) throw errors.INCOMPLETE_FRAME()

  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)

  const fin = !!(b[i] & FIN)

  const rsv1 = !!(b[i] & RSV1)
  const rsv2 = !!(b[i] & RSV2)
  const rsv3 = !!(b[i] & RSV3)

  const op = b[i] & OPCODE

  i++

  const masked = !!(b[i] & MASK)

  let length = b[i] & LENGTH

  i++

  if (op >= opcode.CLOSE) {
    // https://datatracker.ietf.org/doc/html/rfc6455#section-5.5
    if (length > MAX_CONTROL_PAYLOAD_LENGTH) {
      throw errors.INVALID_CONTROL_PAYLOAD_LENGTH(
        `Control frame payload must be at most ${MAX_CONTROL_PAYLOAD_LENGTH} bytes`
      )
    }

    if (fin === false) {
      throw errors.UNEXPECTED_CONTROL('Control frames must not be fragmented')
    }
  } else if (length === 0x7e) {
    if (end - i < 2) throw errors.INCOMPLETE_FRAME()

    length = view.getUint16(i, false)

    i += 2
  } else if (length === 0x7f) {
    if (end - i < 8) throw errors.INCOMPLETE_FRAME()

    const high = view.getUint32(i, false)

    if (high >= 0x200000) throw errors.INVALID_PAYLOAD_LENGTH()

    i += 4

    const low = view.getUint32(i, false)

    i += 4

    length = high * 0x100000000 + low
  }

  // Refused on the header alone, before any of the payload is buffered.
  if (maxPayload >= 0 && length > maxPayload) {
    throw errors.MESSAGE_TOO_LARGE(
      `Frame payload of ${length} bytes exceeds the ${maxPayload} byte limit`
    )
  }

  let mask = null

  if (masked) {
    if (end - i < 4) throw errors.INCOMPLETE_FRAME()

    mask = Buffer.allocUnsafe(4)
    mask.set(b.subarray(i, i + 4))

    i += 4
  }

  if (end - i < length) {
    throw errors.INCOMPLETE_FRAME('Incomplete frame', i - s + length)
  }

  let payload = EMPTY

  if (length > 0) {
    payload = Buffer.allocUnsafe(length)

    if (mask) {
      for (let j = 0; j < length; j++) {
        payload[j] = b[i + j] ^ mask[j & 3]
      }
    } else {
      payload.set(b.subarray(i, i + length))
    }
  }

  i += length

  state.start = i

  return new Frame(op, payload, { fin, rsv1, rsv2, rsv3, mask })
}
