exports.EOL = '\r\n'
exports.EOF = exports.EOL.repeat(2)

exports.GUID = Buffer.from('258EAFA5-E914-47DA-95CA-C5AB0DC85B11')

// https://datatracker.ietf.org/doc/html/rfc6455#section-11.8
exports.opcode = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-7.4.1
exports.status = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  NO_STATUS_RECEIVED: 1005,
  ABNORMAL_CLOSURE: 1006,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_LARGE: 1009,
  MISSING_EXTENSION: 1010,
  INTERNAL_ERROR: 1011,
  SERVICE_RESTART: 1012,
  TRY_AGAIN_LATER: 1013,
  BAD_GATEWAY: 1014,
  TLS_HANDSHAKE_FAILURE: 1015
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-7.4
exports.isValidStatus = function isValidStatus(code) {
  if (code < 1000 || code > 4999) return false

  // 1004 is reserved with no meaning yet; the other three are conditions only
  // this end can report, so no peer may send them.
  if (code < 3000) {
    if (code > 1015) return false

    return (
      code !== 1004 &&
      code !== exports.status.NO_STATUS_RECEIVED &&
      code !== exports.status.ABNORMAL_CLOSURE &&
      code !== exports.status.TLS_HANDSHAKE_FAILURE
    )
  }

  return true
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-5.5
exports.MAX_CONTROL_PAYLOAD_LENGTH = 125

exports.MAX_PAYLOAD_LENGTH = 100 * 1024 * 1024

// Bounded separately from the byte total, since an empty fragment costs a peer
// 6 bytes and costs us a frame.
exports.MAX_FRAGMENTS = 1024

// Bounded apart from both of the above, since a chunk costs far more than the
// byte it may carry and a peer choosing how to split its writes controls how
// many of them a single frame is assembled from.
exports.MAX_BUFFERED_CHUNKS = 256 * 1024

// How long a client waits for a server to answer its handshake. The idle
// timeout cannot bound this, as it is not armed until the socket has been
// handed over.
exports.HANDSHAKE_TIMEOUT = 30000

exports.IDLE_TIMEOUT = 120000

// How long a connection has to close of its own accord once the server has
// asked it to, before it is dropped.
exports.CLOSE_TIMEOUT = 5000
