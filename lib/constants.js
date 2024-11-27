const EOL = (exports.EOL = '\r\n')

exports.EOF = EOL.repeat(2)

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
  PROTOCOL_ERROR: 1002,
  MESSAGE_TOO_LARGE: 1009
}
