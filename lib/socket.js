const { Duplex } = require('bare-stream')
const { opcode } = require('./constants')
const errors = require('./errors')
const Frame = require('./frame')

const CLOSE = new Frame(opcode.CLOSE).toBuffer()

module.exports = class WebSocket extends Duplex {
  constructor (opts = {}) {
    const {
      isServer = false
    } = opts

    super()

    this._isServer = isServer
    this._mask = isServer ? null : Buffer.allocUnsafe(4)
    this._fragments = []

    this._buffer = null
  }

  _attach (socket) {
    this._socket = socket

    this._socket
      .on('error', this._onerror.bind(this))
      .on('close', this._onclose.bind(this))
      .on('data', this._ondata.bind(this))

    return this
  }

  _onerror (err) {
    this.destroy(err)
  }

  _onclose () {
    this.destroy()
  }

  _ondata (data) {
    if (this._buffer === null) this._buffer = data
    else this._buffer = Buffer.concat([this._buffer, data])

    while (this._buffer !== null) {
      const state = { start: 0, end: this._buffer.length, buffer: this._buffer }

      const frame = Frame.decode(state, { isServer: this._isServer })

      if (frame === null) return

      this._buffer = state.start === state.end ? null : this._buffer.subarray(state.start)

      this._onframe(frame)
    }
  }

  _onframe (frame) {
    if (frame.payload.length > 0 && !frame.mask === this._isServer) {
      throw this._isServer ? errors.EXPECTED_MASK() : errors.UNEXPECTED_MASK()
    }

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
        this.push(null)
        this._socket.end(CLOSE)
    }
  }

  _write (data, encoding, cb) {
    const frame = new Frame(opcode.BINARY, data, { mask: this._mask })

    this._socket.write(frame.toBuffer())

    cb(null)
  }

  _predestroy () {
    this._socket.destroy()
  }
}
