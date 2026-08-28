const EventEmitter = require('bare-events')
const { isWritable } = require('bare-stream')
const http = require('bare-http1')
const https = require('bare-https')
const crypto = require('bare-crypto')
const { GUID, EOL, EOF, HANDSHAKE_TIMEOUT, CLOSE_TIMEOUT } = require('./constants')
const errors = require('./errors')
const { destroySoon } = require('./destroy')
const WebSocket = require('./socket')

const EMPTY = Buffer.alloc(0)

const KEY = /^[+/0-9A-Za-z]{22}==$/

module.exports = exports = class WebSocketServer extends EventEmitter {
  constructor(opts = {}, onconnection) {
    if (typeof opts === 'function') {
      onconnection = opts
      opts = {}
    }

    super()

    const createServer = opts.secure ? https.createServer : http.createServer

    const {
      verifyClient = null,
      maxPayload,
      maxFragments,
      maxBufferedChunks,
      minBufferedChunks,
      minChunkAverage,
      idleTimeout,
      handshakeTimeout = HANDSHAKE_TIMEOUT,
      closeTimeout = CLOSE_TIMEOUT,
      server = createServer(opts, this._onrequest.bind(this)).listen(
        opts,
        this._onlistening.bind(this)
      )
    } = opts

    this._server = server
    this._verifyClient = verifyClient
    this._handshakeTimeout = handshakeTimeout
    this._closeTimeout = closeTimeout
    this._socketOptions = {
      maxPayload,
      maxFragments,
      maxBufferedChunks,
      minBufferedChunks,
      minChunkAverage,
      idleTimeout,
      closeTimeout
    }

    // A socket handed over by an upgrade is no longer the HTTP server's to
    // close, as it is in Node.js, so closing one is this side's job. Sockets
    // still in the handshake are tracked apart, having nothing to close yet,
    // each against the deadline it has to finish within.
    this._connections = new Set()
    this._handshakes = new Map()

    // The sockets this side has already put a response on. A handshake is
    // answered once: one that has been refused may still have a `verifyClient`
    // resolving behind it, and a second response would run into the first.
    this._answered = new WeakSet()

    this._closing = false

    this._server
      // The server underneath is not the one the caller holds, so what it
      // reports has to reach them through this one. An unheard 'error' is not
      // catchable, and a failure to bind is reported nowhere else.
      .on('error', this._onerror.bind(this))
      .on('close', this._onclose.bind(this))
      .on('upgrade', this._onupgrade.bind(this))

    if (onconnection) this.on('connection', onconnection)
  }

  get listening() {
    return this._server.listening
  }

  /** The connections the server has open. */
  get connections() {
    return this._connections
  }

  address() {
    return this._server.address()
  }

  close(cb) {
    this._closing = true

    for (const socket of this._handshakes.keys()) destroySoon(socket, this._closeTimeout)

    for (const connection of this._connections) {
      connection.end()

      // Bounds a peer that never answers our close frame, so that closing the
      // server does not wait on one that has stopped taking part.
      if (this._closeTimeout > 0) {
        const timer = setTimeout(() => connection.destroy(), this._closeTimeout)

        timer.unref()

        connection.once('close', () => clearTimeout(timer))
      }
    }

    this._server.close(cb)

    return this
  }

  ref() {
    this._server.ref()

    return this
  }

  unref() {
    this._server.unref()

    return this
  }

  _onlistening() {
    this.emit('listening')
  }

  _onerror(err) {
    this.emit('error', err)
  }

  _onclose() {
    this.emit('close')
  }

  _onrequest(req, res) {
    const body = http.constants.status[426]

    res.writeHead(426, {
      'Content-Type': 'text/plain',
      'Content-Length': body.length
    })

    res.end(body)
  }

  _onupgrade(req, socket, head) {
    // Until a `WebSocket` adopts this socket or it is rejected, nothing is
    // watching it, and an unheard `error` is not catchable and ends the process.
    socket.on('error', noop)

    // A `verifyClient` that never settles would otherwise hold the connection
    // for as long as the peer cared to keep it. The idle timeout cannot bound
    // this either, as it is not armed until the socket has been handed over.
    let timer = null

    if (this._handshakeTimeout > 0) {
      timer = setTimeout(
        () => this._reject(socket, errors.CONNECTION_TIMEOUT('Handshake timed out')),
        this._handshakeTimeout
      )

      timer.unref()
    }

    this._handshakes.set(socket, timer)

    socket.on('close', () => this._endhandshake(socket))

    if (this._verifyClient === null) return this._upgrade(req, socket, head)

    let verified

    try {
      verified = this._verifyClient(req)
    } catch (err) {
      return this._reject(socket, rejected(err))
    }

    if (verified !== null && typeof verified === 'object' && typeof verified.then === 'function') {
      verified.then(
        (ok) => {
          if (ok) this._upgrade(req, socket, head)
          else this._reject(socket, errors.UPGRADE_REJECTED())
        },
        (err) => this._reject(socket, rejected(err))
      )

      return
    }

    if (verified) this._upgrade(req, socket, head)
    else this._reject(socket, errors.UPGRADE_REJECTED())
  }

  // A handshake is over, whichever way it went: it has no deadline left to run
  // and is no longer the server's to close.
  _endhandshake(socket) {
    const timer = this._handshakes.get(socket)

    if (timer) clearTimeout(timer)

    this._handshakes.delete(socket)
  }

  _upgrade(req, socket, head) {
    // A `verifyClient` that resolves after the handshake has been answered,
    // whether refused or given up on when it ran out of time, has nothing left
    // to hand the connection to either.
    if (this._answered.has(socket)) return

    // A `verifyClient` that resolves after the server has been closed has
    // nothing left to hand the connection to.
    if (this._closing) return this._reject(socket, errors.UPGRADE_REJECTED('Server is closing'))

    // One that resolves after the peer has gone has nothing left to hand over
    // either, and a socket that has already closed never tells the `WebSocket`
    // adopting it that it did, leaving it open for as long as the idle timeout
    // allows.
    if (socket.destroying) {
      return this._reject(socket, errors.NETWORK_ERROR('Connection closed during the handshake'))
    }

    exports.handshake(req, socket, head, (err) => {
      if (err) return this._reject(socket, err)

      this._answered.add(socket)

      socket.off('error', noop)

      this._endhandshake(socket)

      const ws = new WebSocket({ ...this._socketOptions, socket, isServer: true })

      this._connections.add(ws)

      ws.on('close', () => this._connections.delete(ws))

      this.emit('connection', ws, req)
    })
  }

  // Reported as `handshakeError` rather than `error`, so that a server with no
  // listener for it does not die on a malformed request.
  _reject(socket, err) {
    if (this._answered.has(socket)) return

    this._answered.add(socket)

    this._endhandshake(socket)

    if (isWritable(socket)) socket.write(response(err))

    this.emit('handshakeError', err, socket)

    destroySoon(socket, this._closeTimeout)
  }
}

function noop() {}

// A `verifyClient` may throw or reject with anything at all, and one that
// carries no message must not fail a second time on its way to being reported,
// which would leave the socket unanswered and take the server down with it.
function rejected(err) {
  if (typeof err === 'string') return errors.UPGRADE_REJECTED(err)

  if (err !== null && typeof err === 'object' && typeof err.message === 'string') {
    return errors.UPGRADE_REJECTED(err.message)
  }

  return errors.UPGRADE_REJECTED()
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-4.2.2
function response(err) {
  let code = 400
  let reason = 'Bad Request'

  const headers = ['Connection: close', 'Content-Length: 0']

  switch (err.code) {
    case 'INVALID_METHOD':
      code = 405
      reason = 'Method Not Allowed'
      headers.push('Allow: GET')
      break

    case 'INVALID_VERSION_HEADER':
      code = 426
      reason = 'Upgrade Required'
      headers.push('Sec-WebSocket-Version: 13')
      break

    case 'UPGRADE_REJECTED':
      code = 403
      reason = 'Forbidden'
      break

    case 'CONNECTION_TIMEOUT':
      code = 408
      reason = 'Request Timeout'
      break
  }

  return [`HTTP/1.1 ${code} ${reason}`, ...headers].join(EOL) + EOF
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-4.2
exports.handshake = function handshake(req, socket = req.socket, head = EMPTY, cb) {
  if (typeof socket === 'function') {
    cb = socket
    socket = req.socket
    head = EMPTY
  } else if (typeof head === 'function') {
    cb = head
    head = EMPTY
  }

  if (typeof cb !== 'function') {
    throw new TypeError('Callback is required')
  }

  // https://datatracker.ietf.org/doc/html/rfc6455#section-4.2.1
  if (req.method !== 'GET') {
    return cb(errors.INVALID_METHOD(`Expected a GET request, got ${req.method}`))
  }

  const upgrade = req.headers.upgrade

  if (typeof upgrade !== 'string' || upgrade.toLowerCase() !== 'websocket') {
    return cb(errors.INVALID_UPGRADE_HEADER())
  }

  const version = +req.headers['sec-websocket-version']

  if (version !== 8 && version !== 13) {
    return cb(errors.INVALID_VERSION_HEADER())
  }

  const key = req.headers['sec-websocket-key']

  if (!key || !KEY.test(key)) {
    return cb(errors.INVALID_KEY_HEADER())
  }

  const digest = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

  socket.write(
    'HTTP/1.1 101 Web Socket Protocol Handshake' +
      EOL +
      'Upgrade: WebSocket' +
      EOL +
      'Connection: Upgrade' +
      EOL +
      `Sec-WebSocket-Accept: ${digest}` +
      EOF
  )

  if (head.byteLength) socket.unshift(head)

  cb(null)
}
