const { Duplex } = require('bare-stream')
const http = require('bare-http1')
const https = require('bare-https')
const crypto = require('bare-crypto')
const {
  GUID,
  opcode,
  status,
  isValidStatus,
  MAX_CONTROL_PAYLOAD_LENGTH,
  MAX_PAYLOAD_LENGTH,
  MAX_FRAGMENTS,
  MAX_BUFFERED_CHUNKS,
  IDLE_TIMEOUT,
  CLOSE_TIMEOUT
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
      maxBufferedChunks = MAX_BUFFERED_CHUNKS,
      idleTimeout = IDLE_TIMEOUT
    } = opts

    super({ eagerOpen: true })

    this._socket = null
    this._isServer = isServer
    this._mask = isServer ? null : Buffer.allocUnsafe(4)

    this._maxPayload = maxPayload
    this._maxFragments = maxFragments
    this._maxBufferedChunks = maxBufferedChunks
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

    // What the peer closed with, which stays an abnormal closure unless a close
    // frame arrives to say otherwise.
    this._closeCode = status.ABNORMAL_CLOSURE
    this._closeReason = EMPTY

    this._corked = false

    // Set while the socket is paused because the read queue is full.
    this._paused = false

    this._idleTimer = null
    this._awaitingPong = false

    // Set once our close frame is on its way, which teardown waits to flush.
    this._ended = false

    // Bounds the wait for the peer to answer our close frame.
    this._closeTimer = null

    if (socket !== null) this._attach(socket)
    else this._connect(opts)
  }

  get closeCode() {
    return this._closeCode
  }

  get closeReason() {
    return this._closeReason
  }

  ping(data) {
    if (this._socket === null || this._closed || this.destroying) {
      throw errors.NOT_CONNECTED()
    }

    this._writeControl(opcode.PING, controlPayload(data))
  }

  pong(data) {
    if (this._socket === null || this._closed || this.destroying) {
      throw errors.NOT_CONNECTED()
    }

    this._writeControl(opcode.PONG, controlPayload(data))
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
    // A connection that goes away before a close frame has been exchanged may
    // have taken part of a message with it, which a clean end would not say.
    if (this._closed === false && this.destroying === false) {
      return this.destroy(errors.UNEXPECTED_CLOSE())
    }

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

    // Retained memory has to be bounded by the parts held, not just the bytes
    // in them: a chunk costs far more than the byte it may carry, and a peer
    // that trickles them out never comes near `maxPayload`.
    if (this._maxBufferedChunks >= 0 && this._buffer.length > this._maxBufferedChunks) {
      return this._fail(
        errors.TOO_MANY_CHUNKS(
          `Frame may be buffered from at most ${this._maxBufferedChunks} chunks`
        )
      )
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
        if (err.code !== 'INCOMPLETE_FRAME') return this._fail(err)

        this._frame = err.length
        break
      }

      this._buffered -= state.start
      this._buffer = this._buffered > 0 ? [buffer.subarray(state.start)] : []
      this._frame = -1
    }

    // Whatever is left is held until the rest of its frame arrives. Only the
    // last of it is ever new, every one before it having been copied out when
    // it arrived.
    const last = this._buffer.length - 1

    if (last !== -1) this._buffer[last] = retain(this._buffer[last])
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

    // Refused here rather than once the message is whole, so a peer cannot
    // spend our memory assembling one we were never going to deliver.
    if (isKnownOpcode(frame.opcode) === false) throw errors.INVALID_OPCODE()

    if (frame.fin === false) {
      // `decode` has already refused any fragmented control frame.
      if (this._fragments.length === 0) {
        if (frame.opcode === opcode.CONTINUATION) {
          throw errors.UNEXPECTED_CONTINUATION()
        }
      } else if (frame.opcode !== opcode.CONTINUATION) {
        throw errors.EXPECTED_CONTINUATION()
      }

      if (this._maxFragments >= 0 && this._fragments.length + 1 > this._maxFragments) {
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

    // Only text and binary are left, the rest having returned, and a message is
    // only ever opened by one of the two.
    if (frame.opcode === opcode.TEXT && isValidUTF8(frame.payload) === false) {
      throw errors.INVALID_UTF8('Text frame payload must be valid UTF-8')
    }

    this._push(frame.payload)
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

      const reason = payload.subarray(2)

      if (isValidUTF8(reason) === false) {
        throw errors.INVALID_UTF8('Close reason must be valid UTF-8')
      }

      this._closeCode = code
      this._closeReason = retain(reason)
    } else {
      this._closeCode = status.NO_STATUS_RECEIVED
    }

    this._closed = true

    this.push(null)
    this.end()

    this._endsoon()
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

  // Backpressure has to reach the socket: `maxPayload` bounds a message, not
  // how many of them a peer may leave waiting for a consumer that is behind.
  _push(payload) {
    if (this.push(payload) === false && this._paused === false) {
      this._paused = true

      this._socket.pause()
    }
  }

  _read() {
    if (this._paused) {
      this._paused = false

      this._socket.resume()
    }
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

    if (ArrayBuffer.isView(data) === false) {
      return cb(errors.INVALID_ENCODING('Data must be a string or a buffer'))
    }

    const frame = new Frame(
      encoding === 'buffer' ? opcode.BINARY : opcode.TEXT,
      Buffer.coerce(data),
      { mask: this._mask }
    )

    if (this._socket.write(frame.toBuffer())) cb(null)
    else {
      this._corked = true
      this._pendingWrite = cb
    }
  }

  // https://datatracker.ietf.org/doc/html/rfc6455#section-5.5.1
  _closePayload() {
    if (this._closed === false) return encodeStatus(status.NORMAL_CLOSURE)

    // A peer that sent no status gets none back, since 1005 stands for the
    // absence of one and may never go on the wire.
    if (this._closeCode === status.NO_STATUS_RECEIVED) return EMPTY

    return Buffer.concat([encodeStatus(this._closeCode), this._closeReason])
  }

  _final(cb) {
    if (this._socket === null) return cb(null)

    // Not shared: a client masks every frame it sends and a server masks none.
    const frame = new Frame(opcode.CLOSE, this._closePayload(), { mask: this._mask })

    this._socket.write(frame.toBuffer())

    this._ended = true

    // The connection stays up until the peer has answered, since closing it now
    // would race the close frame it owes us and leave every close looking as
    // abrupt as a connection that was dropped. It has until the timer to reply.
    if (this._closed === false) {
      this._closeTimer = setTimeout(() => this.destroy(), CLOSE_TIMEOUT)

      this._closeTimer.unref()
    }

    this._endsoon()

    cb(null)
  }

  // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.1
  //
  // The connection comes down once both close frames have been exchanged, which
  // either end of the pair may complete. Ending naturally does not destroy the
  // stream, so this is the only place the socket is let go of on that path.
  _endsoon() {
    if (this._ended === false || this._closed === false) return

    if (this._closeTimer !== null) {
      clearTimeout(this._closeTimer)
      this._closeTimer = null
    }

    destroySoon(this._socket)
  }

  _predestroy() {
    // A write waiting on `drain` never sees one once the socket is gone, and
    // the stream cannot finish destroying until its callback has run.
    if (this._pendingWrite !== null) {
      const cb = this._pendingWrite
      this._pendingWrite = null

      cb(null)
    }

    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer)
      this._idleTimer = null
    }

    if (this._closeTimer !== null) {
      clearTimeout(this._closeTimer)
      this._closeTimer = null
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

  // The request keeps emitting after the handshake has been settled, so only
  // whichever of the three arrives first is heard.
  let settled = false

  const done = (err) => {
    if (settled) return

    settled = true

    cb(err)
  }

  req.on('upgrade', (res, socket, head) => {
    // The response is nobody's to hear from once the socket has been handed
    // over, but the connection underneath goes on reporting to it, and an
    // unheard 'error' is not catchable and ends the process.
    res.on('error', noop)

    if (res.statusCode !== 101) {
      return done(errors.INVALID_UPGRADE_STATUS(`Expected status 101, got ${res.statusCode}`))
    }

    if (res.headers.upgrade.toLowerCase() !== 'websocket') {
      return done(errors.INVALID_UPGRADE_HEADER())
    }

    const digest = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

    if (res.headers['sec-websocket-accept'] !== digest) {
      return done(errors.INVALID_ACCEPT_HEADER())
    }

    // https://datatracker.ietf.org/doc/html/rfc6455#section-4.1
    const negotiated = checkNegotiated(req, res)

    if (negotiated) return done(negotiated)

    if (head.byteLength) socket.unshift(head)

    done(null)
  })

  // A peer that answers without upgrading, whether it refused the handshake or
  // never spoke the protocol, never reaches `upgrade`. Without this the
  // handshake would simply never finish.
  req.on('response', (res) => {
    res.on('error', noop)

    done(errors.INVALID_UPGRADE_STATUS(`Expected an upgrade, got status ${res.statusCode}`))
  })

  req.on('error', (err) => {
    done(errors.NETWORK_ERROR('Network error', err))
  })

  req.end()
}

// A server may only come back with what the client put on the table. No
// extension is ever offered, since one would change how every frame is read,
// and a subprotocol only if the caller asked for it by name.
function checkNegotiated(req, res) {
  const extensions = res.headers['sec-websocket-extensions']

  if (extensions) {
    return errors.UNEXPECTED_EXTENSION(`No extension was offered, got '${extensions}'`)
  }

  const protocol = res.headers['sec-websocket-protocol']

  if (protocol === undefined) return null

  const offered = req.headers['sec-websocket-protocol']

  if (offered) {
    for (const token of String(offered).split(',')) {
      if (token.trim() === String(protocol).trim()) return null
    }
  }

  return errors.UNEXPECTED_PROTOCOL(`Subprotocol '${protocol}' was not offered`)
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-5.2
function isKnownOpcode(op) {
  return (
    op === opcode.CONTINUATION ||
    op === opcode.TEXT ||
    op === opcode.BINARY ||
    op === opcode.CLOSE ||
    op === opcode.PING ||
    op === opcode.PONG
  )
}

// A control frame carries at most 125 bytes, and a peer must fail the
// connection over one that carries more, so it is refused before it is sent.
function controlPayload(data) {
  if (data === undefined) return EMPTY

  if (typeof data === 'string') data = Buffer.from(data)
  else if (ArrayBuffer.isView(data)) data = Buffer.coerce(data)
  else throw new TypeError('Payload must be a string or a buffer')

  if (data.byteLength > MAX_CONTROL_PAYLOAD_LENGTH) {
    throw errors.INVALID_CONTROL_PAYLOAD_LENGTH(
      `Control frame payload must be at most ${MAX_CONTROL_PAYLOAD_LENGTH} bytes`
    )
  }

  return data
}

// A view keeps the whole buffer behind it alive, and a socket hands out views
// of a read buffer it shares between chunks, so one carrying a fraction of what
// it pins is copied into a buffer of its own. `Buffer.from` would copy it into
// a pool and pin that instead, so the copy has to be made unpooled.
function retain(buffer) {
  if (buffer.byteLength * 2 >= buffer.buffer.byteLength) return buffer

  const copy = Buffer.allocUnsafeSlow(buffer.byteLength)

  copy.set(buffer)

  return copy
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

function noop() {}
