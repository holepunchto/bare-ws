const { Duplex } = require('bare-stream')
const http = require('bare-http1')
const https = require('bare-https')
const crypto = require('bare-crypto')
const { GUID, opcode } = require('./constants')
const errors = require('./errors')
const Frame = require('./frame')

const CLOSE = new Frame(opcode.CLOSE).toBuffer()

module.exports = exports = class WebSocket extends Duplex {
  constructor (url, opts = {}) {
    if (typeof url === 'string') url = new URL(url)

    if (URL.isURL(url)) {
      opts = opts ? { ...opts } : {}

      opts.host = url.hostname
      opts.path = url.pathname + url.search
      opts.port = url.port ? parseInt(url.port, 10) : defaultPort(url)
      opts.secure = url.protocol === 'https:' || url.protocol === 'wss:'
    } else {
      opts = url ? { ...url } : {}
    }

    const {
      isServer = false,
      socket = null
    } = opts

    super()

    this._socket = null
    this._isServer = isServer
    this._mask = isServer ? null : Buffer.allocUnsafe(4)
    this._fragments = []

    this._pendingOpen = null
    this._pendingWrite = null

    this._buffer = null

    if (socket !== null) this._attach(socket)
    else this._connect(opts)
  }

  _attach (socket) {
    this._socket = socket

    this._socket
      .on('error', this._onerror.bind(this))
      .on('close', this._onclose.bind(this))
      .on('data', this._ondata.bind(this))
      .on('drain', this._ondrain.bind(this))
  }

  _connect (opts) {
    const request = opts.secure ? https.request : http.request

    const req = request(opts)

    handshake(req, (err) => {
      const cb = this._pendingOpen
      this._pendingOpen = null

      if (err) req.socket.destroy()
      else this._attach(req.socket)

      cb(err)
    })
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
        this.end()
    }
  }

  _ondrain () {
    if (this._pendingWrite === null) return
    const cb = this._pendingWrite
    this._pendingWrite = null
    cb(null)
  }

  _open (cb) {
    if (this._socket === null) this._pendingOpen = cb
    else cb(null)
  }

  _write (data, encoding, cb) {
    if (encoding !== 'buffer' && encoding !== 'utf8') {
      return cb(errors.INVALID_ENCODING())
    }

    const frame = new Frame(encoding === 'buffer' ? opcode.BINARY : opcode.TEXT, data, { mask: this._mask })

    if (this._socket.write(frame.toBuffer())) cb(null)
    else this._pendingWrite = cb
  }

  _final (cb) {
    this._socket.end(CLOSE)
    cb(null)
  }

  _predestroy () {
    this._socket.destroy()
  }
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-4.1
const handshake = exports.handshake = function handshake (req, cb) {
  const key = crypto.randomBytes(16).toString('base64')

  req.headers = {
    ...req.headers,
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Version': 13,
    'Sec-WebSocket-Key': key
  }

  req.on('upgrade', (res, socket, head) => {
    if (res.headers.upgrade.toLowerCase() !== 'websocket') {
      return cb(errors.INVALID_UPGRADE_HEADER())
    }

    const digest = crypto.createHash('sha1')
      .update(key)
      .update(GUID)
      .digest('base64')

    if (res.headers['sec-websocket-accept'] !== digest) {
      return cb(errors.INVALID_ACCEPT_HEADER())
    }

    if (head.byteLength) socket.unshift(head)

    cb(null)
  })

  req.end()
}

// https://url.spec.whatwg.org/#default-port
function defaultPort (url) {
  switch (url.protocol) {
    case 'ftp:': return 21
    case 'http':
    case 'ws': return 80
    case 'https':
    case 'wss': return 443
  }

  return null
}
