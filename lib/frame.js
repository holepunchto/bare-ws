const crypto = require('bare-crypto')
const { opcode, MAX_CONTROL_PAYLOAD_LENGTH, MAX_PAYLOAD_LENGTH } = require('./constants')
const errors = require('./errors')
const { mask } = require('./mask')

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

// The most a header may occupy: two bytes, a 64 bit length, and a mask.
exports.MAX_HEADER_LENGTH = 14

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

    mask(f.payload, 0, b, i, length, f.mask)
  } else {
    b.set(f.payload, i)
  }

  i += length

  state.start = i
}

// How many bytes the header of a frame occupies, given the second of them,
// which says how the payload length is encoded and whether a mask follows it.
exports.headerLength = function headerLength(b) {
  const length = b & LENGTH

  let n = 2

  if (length === 0x7e) n += 2
  else if (length === 0x7f) n += 8

  if (b & MASK) n += 4

  return n
}

// Reads the header of one frame, leaving the payload behind it to be filled in
// as it arrives rather than held until it is whole. The caller is expected to
// have `headerLength` bytes in hand.
exports.decodeHeader = function decodeHeader(state, opts = {}) {
  const { maxPayload = MAX_PAYLOAD_LENGTH } = opts

  const b = state.buffer

  let i = state.start

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
  } else {
    if (length === 0x7e) {
      length = view.getUint16(i, false)

      i += 2
    } else if (length === 0x7f) {
      const high = view.getUint32(i, false)

      if (high >= 0x200000) throw errors.INVALID_PAYLOAD_LENGTH()

      i += 4

      const low = view.getUint32(i, false)

      i += 4

      length = high * 0x100000000 + low
    }

    // Refused on the header alone, before any of the payload is read or any
    // room made for it. A control frame is left out of this, being bounded by
    // its own limit and no part of the message a caller budgets for.
    if (maxPayload >= 0 && length > maxPayload) {
      throw errors.MESSAGE_TOO_LARGE(
        `Frame payload of ${length} bytes exceeds the ${maxPayload} bytes remaining`
      )
    }
  }

  let mask = null

  if (masked) {
    // Copied out, the header it came in being either reused or handed back.
    mask = Buffer.allocUnsafe(4)
    mask.set(b.subarray(i, i + 4))

    i += 4
  }

  state.start = i

  return { fin, rsv1, rsv2, rsv3, opcode: op, mask, length }
}
