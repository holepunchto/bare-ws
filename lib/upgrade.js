const crypto = require('bare-crypto')
const { GUID, EOL, EOF } = require('./constants')
const WebSocket = require('./socket')

const EMPTY = Buffer.alloc(0)

module.exports = function upgrade (req, socket = req.socket, head = EMPTY) {
  if (req.headers.upgrade.toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request')
    return null
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

  return new WebSocket({ isServer: true })._attach(socket)
}
