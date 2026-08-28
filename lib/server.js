const EventEmitter = require('bare-events')
const { isWritable } = require('bare-stream')
const http = require('bare-http1')
const https = require('bare-https')
const crypto = require('bare-crypto')
const { GUID, EOL, EOF } = require('./constants')
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
      idleTimeout,
      server = createServer(opts, this._onrequest.bind(this)).listen(
        opts,
        this._onlistening.bind(this)
      )
    } = opts

    this._server = server
    this._verifyClient = verifyClient
    this._socketOptions = { maxPayload, maxFragments, idleTimeout }

    this._server.on('upgrade', this._onupgrade.bind(this))

    if (onconnection) this.on('connection', onconnection)
  }

  get listening() {
    return this._server.listening
  }

  address() {
    return this._server.address()
  }

  close(cb) {
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

    if (this._verifyClient === null) return this._upgrade(req, socket, head)

    let verified

    try {
      verified = this._verifyClient(req)
    } catch (err) {
      return this._reject(socket, errors.UPGRADE_REJECTED(err.message))
    }

    if (verified !== null && typeof verified === 'object' && typeof verified.then === 'function') {
      verified.then(
        (ok) => {
          if (ok) this._upgrade(req, socket, head)
          else this._reject(socket, errors.UPGRADE_REJECTED())
        },
        (err) => this._reject(socket, errors.UPGRADE_REJECTED(err.message))
      )

      return
    }

    if (verified) this._upgrade(req, socket, head)
    else this._reject(socket, errors.UPGRADE_REJECTED())
  }

  _upgrade(req, socket, head) {
    exports.handshake(req, socket, head, (err) => {
      if (err) return this._reject(socket, err)

      socket.off('error', noop)

      const ws = new WebSocket({ ...this._socketOptions, socket, isServer: true })

      this.emit('connection', ws, req)
    })
  }

  // Reported as `handshakeError` rather than `error`, so that a server with no
  // listener for it does not die on a malformed request.
  _reject(socket, err) {
    if (isWritable(socket)) socket.write(response(err))

    destroySoon(socket)

    this.emit('handshakeError', err, socket)
  }
}

function noop() {}

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
