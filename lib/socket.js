const { Duplex } = require('bare-stream')
const http = require('bare-http1')
const https = require('bare-https')
const crypto = require('bare-crypto')
const {
  GUID,
  opcode,
  status,
  isValidStatus,
  MAX_PAYLOAD_LENGTH,
  MAX_FRAGMENTS,
  IDLE_TIMEOUT
} = require('./constants')
const errors = require('./errors')
const Frame = require('./frame')
const isValidUTF8 = require('./utf8')
const { destroySoon } = require('./destroy')

const EMPTY = Buffer.alloc(0)

module.exports = exports = class WebSocket extends Duplex {
  constructor(url, opts = {}) {
    if (typeof url === 'string') url = new URL(url)

    if (isURL(url)) {
      opts = opts ? { ...opts } : {}

      opts.host = url.hostname
      opts.path = url.pathname + url.search
      opts.port = url.port ? parseInt(url.port, 10) : defaultPort(url)
      opts.secure = url.protocol === 'https:' || url.protocol === 'wss:'
    } else {
      opts = url ? { ...url } : {}

      // For Node.js compatibility
      opts.host = opts.hostname || opts.host
      opts.port = typeof opts.port === 'string' ? parseInt(opts.port, 10) : opts.port
    }

    const {
      isServer = false,
      socket = null,
      maxPayload = MAX_PAYLOAD_LENGTH,
      maxFragments = MAX_FRAGMENTS,
      idleTimeout = IDLE_TIMEOUT
    } = opts

    super({ eagerOpen: true })

    this._socket = null
    this._isServer = isServer
    this._mask = isServer ? null : Buffer.allocUnsafe(4)

    this._maxPayload = maxPayload
    this._maxFragments = maxFragments
    this._idleTimeout = idleTimeout

    this._fragments = []
    this._fragmented = 0

    this._pendingOpen = null
    this._pendingWrite = null
    this._pendingPong = null

    // Holds a socket this side has not been handed yet, so teardown goes
    // through it.
    this._request = null

    this._buffer = []
    this._buffered = 0
    this._frame = -1

    // Nothing is parsed once this is set.
    this._closed = false

    this._corked = false

    this._idleTimer = null
    this._awaitingPong = false

    // Set once our close frame is on its way, which teardown waits to flush.
    this._ended = false

    if (socket !== null) this._attach(socket)
    else this._connect(opts)
  }

  ping(data) {
    if (this._socket === null) throw errors.NOT_CONNECTED()

    if (typeof data === 'string') data = Buffer.from(data)

    this._writeControl(opcode.PING, data)
  }

  pong(data) {
    if (this._socket === null) throw errors.NOT_CONNECTED()

    if (typeof data === 'string') data = Buffer.from(data)

    this._writeControl(opcode.PONG, data)
  }

  _writeControl(op, payload = EMPTY) {
    const frame = new Frame(op, payload, { mask: this._mask })

    if (this._socket.write(frame.toBuffer()) === false) this._corked = true
  }

  _attach(socket) {
    this._socket = socket

    this._socket
      .on('error', this._onerror.bind(this))
      .on('close', this._onclose.bind(this))
      .on('data', this._ondata.bind(this))
      .on('drain', this._ondrain.bind(this))

    if (this._idleTimeout > 0) {
      // Half the budget, leaving the rest for the peer to answer the ping.
      this._idleTimer = setTimeout(this._onidle.bind(this), this._idleTimeout / 2)
      this._idleTimer.unref()
    }
  }

  _connect(opts) {
    const request = opts.secure ? https.request : http.request

    const req = (this._request = request(opts))

    exports.handshake(req, (err) => {
      this._request = null

      const cb = this._pendingOpen
      this._pendingOpen = null

      // Given up on mid-handshake, so there is nothing left to attach it to.
      if (err || this.destroying) {
        if (req.socket) req.socket.destroy()
      } else {
        this._attach(req.socket)
      }

      // Whichever of `upgrade` and `error` fires second has nobody waiting.
      if (cb) cb(err)
      else if (err) this.destroy(err)
    })
  }

  _onerror(err) {
    this.destroy(err)
  }

  _onclose() {
    this.destroy()
  }

  _onidle() {
    if (this._awaitingPong) {
      return this._fail(errors.CONNECTION_TIMEOUT())
    }

    this._awaitingPong = true

    if (this._socket !== null && this._closed === false) {
      this._writeControl(opcode.PING)
    }

    this._idleTimer.refresh()
  }

  _ondata(data) {
    if (this._closed) return

    this._buffer.push(data)
    this._buffered += data.byteLength

    if (this._idleTimer !== null) {
      this._awaitingPong = false
      this._idleTimer.refresh()
    }

    while (
      this._closed === false &&
      this._buffered > 0 &&
      (this._frame === -1 || this._frame <= this._buffered)
    ) {
      const buffer = this._buffer.length === 1 ? this._buffer[0] : Buffer.concat(this._buffer)

      this._buffer = [buffer]

      const state = { start: 0, end: buffer.byteLength, buffer }

      try {
        this._onframe(Frame.decode(state, { maxPayload: this._maxPayload }))
      } catch (err) {
        if (err.code === 'INCOMPLETE_FRAME') this._frame = err.length
        else this._fail(err)
        return
      }

      this._buffered -= state.start
      this._buffer = this._buffered > 0 ? [buffer.subarray(state.start)] : []
      this._frame = -1
    }
  }

  _onframe(frame) {
    if (frame.rsv1) throw errors.UNEXPECTED_RSV1()

    if (frame.rsv2) throw errors.UNEXPECTED_RSV2()

    if (frame.rsv3) throw errors.UNEXPECTED_RSV3()

    if (this._isServer) {
      if (frame.mask === null) throw errors.EXPECTED_MASK()
    } else {
      if (frame.mask !== null) throw errors.UNEXPECTED_MASK()
    }

    if (frame.fin === false) {
      // `decode` has already refused any fragmented control frame.
      if (this._fragments.length === 0) {
        if (frame.opcode === opcode.CONTINUATION) {
          throw errors.UNEXPECTED_CONTINUATION()
        }
      } else if (frame.opcode !== opcode.CONTINUATION) {
        throw errors.EXPECTED_CONTINUATION()
      }

      if (this._fragments.length + 1 > this._maxFragments) {
        throw errors.TOO_MANY_FRAGMENTS(
          `Message may be assembled from at most ${this._maxFragments} fragments`
        )
      }

      this._fragmented = this._checkLength(this._fragmented + frame.payload.length)

      this._fragments.push(frame)

      return
    }

    switch (frame.opcode) {
      case opcode.CLOSE:
        return this._oncloseframe(frame)

      case opcode.PING:
        this._onping(frame.payload)
        return

      case opcode.PONG:
        this.emit('pong', frame.payload)
        return

      case opcode.CONTINUATION: {
        if (this._fragments.length === 0) throw errors.UNEXPECTED_CONTINUATION()

        this._checkLength(this._fragmented + frame.payload.length)

        frame.opcode = this._fragments[0].opcode

        const payloads = this._fragments.map((frame) => frame.payload)

        payloads.push(frame.payload)

        frame.payload = Buffer.concat(payloads)

        this._fragments = []
        this._fragmented = 0

        break
      }

      default:
        if (this._fragments.length > 0) throw errors.EXPECTED_CONTINUATION()
    }

    switch (frame.opcode) {
      case opcode.TEXT:
        if (isValidUTF8(frame.payload) === false) {
          throw errors.INVALID_UTF8('Text frame payload must be valid UTF-8')
        }

        this.push(frame.payload)
        break

      case opcode.BINARY:
        this.push(frame.payload)
        break

      default:
        throw errors.INVALID_OPCODE()
    }
  }

  // https://datatracker.ietf.org/doc/html/rfc6455#section-5.5.1
  _oncloseframe(frame) {
    const payload = frame.payload

    if (payload.length === 1) {
      throw errors.INVALID_CLOSE_PAYLOAD('Close payload must be empty or at least 2 bytes')
    }

    if (payload.length >= 2) {
      const code = payload.readUInt16BE(0)

      if (isValidStatus(code) === false) {
        throw errors.INVALID_CLOSE_STATUS(`Close status ${code} must not be sent`)
      }

      if (isValidUTF8(payload.subarray(2)) === false) {
        throw errors.INVALID_UTF8('Close reason must be valid UTF-8')
      }
    }

    this._closed = true

    this.push(null)
    this.end()
  }

  _onping(payload) {
    if (this._corked) {
      // A peer is owed an answer to its most recent ping, not to every one.
      this._pendingPong = payload
    } else {
      this._writeControl(opcode.PONG, payload)
    }

    this.emit('ping', payload)
  }

  _checkLength(length) {
    if (this._maxPayload >= 0 && length > this._maxPayload) {
      throw errors.MESSAGE_TOO_LARGE(
        `Message of ${length} bytes exceeds the ${this._maxPayload} byte limit`
      )
    }

    return length
  }

  _fail(err) {
    if (this._closed === false) {
      this._closed = true

      if (err.status && this._socket !== null && this._socket.writable) {
        this._writeControl(opcode.CLOSE, encodeStatus(err.status))

        this._ended = true
      }
    }

    this.destroy(err)
  }

  _ondrain() {
    this._corked = false

    if (this._pendingPong !== null) {
      const payload = this._pendingPong
      this._pendingPong = null

      if (this._closed === false && this._socket !== null) {
        this._writeControl(opcode.PONG, payload)
      }
    }

    if (this._pendingWrite === null) return
    const cb = this._pendingWrite
    this._pendingWrite = null
    cb(null)
  }

  _open(cb) {
    if (this._socket === null) this._pendingOpen = cb
    else cb(null)
  }

  _write(data, encoding, cb) {
    if (encoding !== 'buffer' && encoding !== 'utf8') {
      return cb(errors.INVALID_ENCODING())
    }

    const frame = new Frame(encoding === 'buffer' ? opcode.BINARY : opcode.TEXT, data, {
      mask: this._mask
    })

    if (this._socket.write(frame.toBuffer())) cb(null)
    else {
      this._corked = true
      this._pendingWrite = cb
    }
  }

  _final(cb) {
    if (this._socket === null) return cb(null)

    // Not shared: a client masks every frame it sends and a server masks none.
    const frame = new Frame(opcode.CLOSE, encodeStatus(status.NORMAL_CLOSURE), {
      mask: this._mask
    })

    this._socket.end(frame.toBuffer())

    this._ended = true

    cb(null)
  }

  _predestroy() {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer)
      this._idleTimer = null
    }

    this._fragments = []
    this._fragmented = 0
    this._buffer = []
    this._buffered = 0

    if (this._request !== null) {
      const req = this._request
      this._request = null

      if (req.socket) req.socket.destroy()
    }

    if (this._socket === null) return

    // Flush a close frame we have queued; otherwise the peer sees the
    // connection vanish rather than close.
    if (this._ended) destroySoon(this._socket)
    else this._socket.destroy()
  }
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-4.1
exports.handshake = function handshake(req, cb) {
  const key = crypto.randomBytes(16).toString('base64')

  req.headers = {
    ...req.headers,
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Version': 13,
    'Sec-WebSocket-Key': key
  }

  req.on('upgrade', (res, socket, head) => {
    if (res.statusCode !== 101) {
      return cb(errors.INVALID_UPGRADE_STATUS(`Expected status 101, got ${res.statusCode}`))
    }

    if (res.headers.upgrade.toLowerCase() !== 'websocket') {
      return cb(errors.INVALID_UPGRADE_HEADER())
    }

    const digest = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

    if (res.headers['sec-websocket-accept'] !== digest) {
      return cb(errors.INVALID_ACCEPT_HEADER())
    }

    if (head.byteLength) socket.unshift(head)

    cb(null)
  })

  req.on('error', (err) => {
    cb(errors.NETWORK_ERROR('Network error', err))
  })

  req.end()
}

function encodeStatus(code) {
  const payload = Buffer.allocUnsafe(2)

  payload.writeUInt16BE(code, 0)

  return payload
}

// https://url.spec.whatwg.org/#default-port
function defaultPort(url) {
  switch (url.protocol) {
    case 'ftp:':
      return 21
    case 'http:':
    case 'ws:':
      return 80
    case 'https:':
    case 'wss:':
      return 443
  }

  return null
}

// https://url.spec.whatwg.org/#api
function isURL(url) {
  return (
    url !== null &&
    typeof url === 'object' &&
    typeof url.protocol === 'string' &&
    typeof url.hostname === 'string' &&
    typeof url.pathname === 'string' &&
    typeof url.search === 'string'
  )
}
