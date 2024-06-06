const { Duplex } = require('bare-stream')
const { opcode } = require('./constants')

const FIN = 0b10000000
const RSV1 = 0b01000000
const RSV2 = 0b00100000
const RSV3 = 0b00010000
const OPCODE = 0b00001111
const MASKED = 0b10000000
const LENGTH = 0b01111111

const CLOSE = Buffer.from([FIN | opcode.CLOSE, 0])

module.exports = class WebSocket extends Duplex {
  constructor () {
    super()

    this._buffer = null
    this._fragments = []
  }

  _attach (socket) {
    this._socket = socket

    this._socket
      .on('error', this._onerror.bind(this))
      .on('data', this._ondata.bind(this))

    return this
  }

  _onerror (err) {
    this.destroy(err)
  }

  _ondata (data) {
    if (this._buffer === null) this._buffer = data
    else this._buffer = Buffer.concat([this._buffer, data])

    const b = this._buffer

    let n = b.length
    let i = 0

    if (n < 2) return

    const view = new DataView(b.buffer, b.byteOffset, b.byteLength)

    const fin = !!(b[i] & FIN)

    const rsv1 = !!(b[i] & RSV1)
    const rsv2 = !!(b[i] & RSV2)
    const rsv3 = !!(b[i] & RSV3)

    const opcode = b[i] & OPCODE

    i++
    n--

    const masked = !!(b[i] & MASKED)

    let length = b[i] & LENGTH

    i++
    n--

    if (length === 0x7e) {
      if (n < 4) return
    } else if (length === 0x7f) {
      if (n < 8) return

      const high = view.getUint32(i, false)

      i += 4
      n -= 4

      const low = view.getUint32(i, false)

      i += 4
      n -= 4

      length = high * 2 ** 32 + low
    }

    let mask = null

    if (masked) {
      if (n < 4) return

      mask = b.subarray(i, i + 4)

      i += 4
      n -= 4
    }

    if (n < length) return

    const payload = b.subarray(i, i + length)

    i += length
    n -= length

    if (masked) {
      for (let i = 0, n = payload.length; i < n; i++) {
        payload[i] ^= mask[i & 3]
      }
    }

    this._buffer = n === 0 ? null : b.subarray(i)

    this._onframe({
      fin,
      rsv1,
      rsv2,
      rsv3,
      opcode,
      payload
    })
  }

  _onframe (frame) {
    if (frame.fin === 0) {
      this._fragments.push(frame)
      return
    }

    if (this._fragments.length > 0) {
      frame.opcode = this._fragments[0].opcode

      const payloads = this._fragments.map(frame => frame.payload)

      payloads.push(frame.payload)

      frame.payload = Buffer.concat(payloads)

      this._fragments = []
    }

    switch (frame.opcode) {
      case opcode.TEXT:
      case opcode.BINARY:
        this.push(frame.payload)
        break

      case opcode.CLOSE:
        this._socket.end(CLOSE)
    }
  }
}
