const EventEmitter = require('bare-events')
const http = require('bare-http1')
const https = require('bare-https')
const crypto = require('bare-crypto')
const { GUID, EOL, EOF } = require('./constants')
const errors = require('./errors')
const WebSocket = require('./socket')

const EMPTY = Buffer.alloc(0)

module.exports = exports = class WebSocketServer extends EventEmitter {
  constructor (opts = {}) {
    super()

    const createServer = opts.secure ? https.createServer : http.createServer

    const {
      server = createServer(opts, this._onrequest.bind(this)).listen(opts, this._onlistening.bind(this))
    } = opts

    this._server = server

    this._server.on('upgrade', this._onupgrade.bind(this))
  }

  get listening () {
    return this._server.listening
  }

  address () {
    return this._server.address()
  }

  close (cb) {
    return this._server.close(cb)
  }

  ref () {
    this._server.ref()
  }

  unref () {
    this._server.unref()
  }

  _onlistening () {
    this.emit('listening')
  }

  _onrequest (req, res) {
    const body = http.constants.status[426]

    res.writeHead(426, {
      'Content-Type': 'text/plain',
      'Content-Length': body.length
    })

    res.end(body)
  }

  _onupgrade (req, socket, head) {
    handshake(req, socket, head, (err) => {
      if (err) return socket.destroy(err)

      this.emit('connection', new WebSocket({ socket, isServer: true }), req)
    })
  }
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-4.2
const handshake = exports.handshake = function handshake (req, socket = req.socket, head = EMPTY, cb) {
  if (typeof socket === 'function') {
    cb = socket
    socket = req.socket
    head = EMPTY
  } else if (typeof head === 'function') {
    cb = head
    head = EMPTY
  }

  if (req.headers.upgrade.toLowerCase() !== 'websocket') {
    return cb(errors.INVALID_UPGRADE_HEADER())
  }

  const key = req.headers['sec-websocket-key']

  const digest = crypto.createHash('sha1')
    .update(key)
    .update(GUID)
    .digest('base64')

  socket.write(
    'HTTP/1.1 101 Web Socket Protocol Handshake' + EOL +
    'Upgrade: WebSocket' + EOL +
    'Connection: Upgrade' + EOL +
    `Sec-WebSocket-Accept: ${digest}` + EOF
  )

  if (head.byteLength) socket.unshift(head)

  cb(null)
}
