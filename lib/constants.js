const EOL = exports.EOL = '\r\n'

exports.EOF = EOL.repeat(2)

exports.GUID = Buffer.from('258EAFA5-E914-47DA-95CA-C5AB0DC85B11')

exports.opcode = {
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8
}
