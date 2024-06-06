const EventEmitter = require('bare-events')
const http = require('bare-http1')
const upgrade = require('./upgrade')

module.exports = class WebSocketServer extends EventEmitter {
  constructor (opts = {}) {
    super()

    const {
      server = http.createServer(opts, this._onrequest.bind(this)).listen(opts)
    } = opts

    this._server = server

    this._server.on('upgrade', this._onupgrade.bind(this))
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
    const ws = upgrade(req, socket, head)

    if (ws) this.emit('connection', ws, req)
  }
}
