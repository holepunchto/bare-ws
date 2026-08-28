const { status } = require('./constants')

module.exports = class WebSocketError extends Error {
  constructor(msg, code, status, fn = WebSocketError, cause) {
    super(`${code}: ${msg}`, { cause })
    this.code = code
    this.status = status

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'WebSocketError'
  }

  static NETWORK_ERROR(msg, cause) {
    return new WebSocketError(msg, 'NETWORK_ERROR', 0, WebSocketError.NETWORK_ERROR, cause)
  }

  static NOT_CONNECTED(msg = 'Socket is not connected') {
    return new WebSocketError(msg, 'NOT_CONNECTED', 0, WebSocketError.NOT_CONNECTED)
  }

  static UNEXPECTED_RSV1(msg = 'RSV1 must be unset') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_RSV1',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_RSV1
    )
  }

  static UNEXPECTED_RSV2(msg = 'RSV2 must be unset') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_RSV2',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_RSV2
    )
  }

  static UNEXPECTED_RSV3(msg = 'RSV3 must be unset') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_RSV3',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_RSV3
    )
  }

  static EXPECTED_MASK(msg = 'MASK must be set') {
    return new WebSocketError(
      msg,
      'EXPECTED_MASK',
      status.PROTOCOL_ERROR,
      WebSocketError.EXPECTED_MASK
    )
  }

  static UNEXPECTED_MASK(msg = 'MASK must be unset') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_MASK',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_MASK
    )
  }

  static EXPECTED_CONTINUATION(msg = 'Expected a continuation frame') {
    return new WebSocketError(
      msg,
      'EXPECTED_CONTINUATION',
      status.PROTOCOL_ERROR,
      WebSocketError.EXPECTED_CONTINUATION
    )
  }

  static UNEXPECTED_CONTINUATION(msg = 'Unexpected continuation frame') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_CONTINUATION',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_CONTINUATION
    )
  }

  static UNEXPECTED_CONTROL(msg = 'Unexpected control frame') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_CONTROL',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_CONTROL
    )
  }

  static INVALID_ENCODING(msg = 'Invalid encoding') {
    return new WebSocketError(
      msg,
      'INVALID_ENCODING',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_ENCODING
    )
  }

  static INVALID_METHOD(msg = 'Invalid request method') {
    return new WebSocketError(
      msg,
      'INVALID_METHOD',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_METHOD
    )
  }

  static INVALID_UPGRADE_HEADER(msg = 'Invalid Upgrade header') {
    return new WebSocketError(
      msg,
      'INVALID_UPGRADE_HEADER',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_UPGRADE_HEADER
    )
  }

  static INVALID_VERSION_HEADER(msg = 'Invalid Sec-WebSocket-Version header') {
    return new WebSocketError(
      msg,
      'INVALID_VERSION_HEADER',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_VERSION_HEADER
    )
  }

  static INVALID_KEY_HEADER(msg = 'Invalid Sec-WebSocket-Key header') {
    return new WebSocketError(
      msg,
      'INVALID_KEY_HEADER',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_KEY_HEADER
    )
  }

  static INVALID_ACCEPT_HEADER(msg = 'Invalid Sec-WebSocket-Accept header') {
    return new WebSocketError(
      msg,
      'INVALID_ACCEPT_HEADER',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_ACCEPT_HEADER
    )
  }

  static UNEXPECTED_EXTENSION(msg = 'Unexpected Sec-WebSocket-Extensions header') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_EXTENSION',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_EXTENSION
    )
  }

  static UNEXPECTED_PROTOCOL(msg = 'Unexpected Sec-WebSocket-Protocol header') {
    return new WebSocketError(
      msg,
      'UNEXPECTED_PROTOCOL',
      status.PROTOCOL_ERROR,
      WebSocketError.UNEXPECTED_PROTOCOL
    )
  }

  static INVALID_UPGRADE_STATUS(msg = 'Invalid response status') {
    return new WebSocketError(
      msg,
      'INVALID_UPGRADE_STATUS',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_UPGRADE_STATUS
    )
  }

  static UPGRADE_REJECTED(msg = 'Upgrade rejected') {
    return new WebSocketError(
      msg,
      'UPGRADE_REJECTED',
      status.POLICY_VIOLATION,
      WebSocketError.UPGRADE_REJECTED
    )
  }

  static INVALID_OPCODE(msg = 'Invalid opcode') {
    return new WebSocketError(
      msg,
      'INVALID_OPCODE',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_OPCODE
    )
  }

  static INVALID_PAYLOAD_LENGTH(msg = 'Invalid payload length') {
    return new WebSocketError(
      msg,
      'INVALID_PAYLOAD_LENGTH',
      status.MESSAGE_TOO_LARGE,
      WebSocketError.INVALID_PAYLOAD_LENGTH
    )
  }

  static INVALID_CONTROL_PAYLOAD_LENGTH(msg = 'Control frame payload is too large') {
    return new WebSocketError(
      msg,
      'INVALID_CONTROL_PAYLOAD_LENGTH',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_CONTROL_PAYLOAD_LENGTH
    )
  }

  static MESSAGE_TOO_LARGE(msg = 'Message is too large') {
    return new WebSocketError(
      msg,
      'MESSAGE_TOO_LARGE',
      status.MESSAGE_TOO_LARGE,
      WebSocketError.MESSAGE_TOO_LARGE
    )
  }

  static TOO_MANY_FRAGMENTS(msg = 'Message has too many fragments') {
    return new WebSocketError(
      msg,
      'TOO_MANY_FRAGMENTS',
      status.MESSAGE_TOO_LARGE,
      WebSocketError.TOO_MANY_FRAGMENTS
    )
  }

  static TOO_MANY_CHUNKS(msg = 'Frame is buffered from too many chunks') {
    return new WebSocketError(
      msg,
      'TOO_MANY_CHUNKS',
      status.MESSAGE_TOO_LARGE,
      WebSocketError.TOO_MANY_CHUNKS
    )
  }

  static CHUNKS_TOO_SMALL(msg = 'Frame is buffered from too many small chunks') {
    return new WebSocketError(
      msg,
      'CHUNKS_TOO_SMALL',
      status.MESSAGE_TOO_LARGE,
      WebSocketError.CHUNKS_TOO_SMALL
    )
  }

  static INVALID_UTF8(msg = 'Invalid UTF-8') {
    return new WebSocketError(
      msg,
      'INVALID_UTF8',
      status.INVALID_PAYLOAD,
      WebSocketError.INVALID_UTF8
    )
  }

  static INVALID_CLOSE_PAYLOAD(msg = 'Invalid close payload') {
    return new WebSocketError(
      msg,
      'INVALID_CLOSE_PAYLOAD',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_CLOSE_PAYLOAD
    )
  }

  static INVALID_CLOSE_STATUS(msg = 'Invalid close status') {
    return new WebSocketError(
      msg,
      'INVALID_CLOSE_STATUS',
      status.PROTOCOL_ERROR,
      WebSocketError.INVALID_CLOSE_STATUS
    )
  }

  static UNEXPECTED_CLOSE(msg = 'Connection closed before a close frame was exchanged') {
    return new WebSocketError(msg, 'UNEXPECTED_CLOSE', 0, WebSocketError.UNEXPECTED_CLOSE)
  }

  static CONNECTION_TIMEOUT(msg = 'Connection timed out') {
    return new WebSocketError(
      msg,
      'CONNECTION_TIMEOUT',
      status.GOING_AWAY,
      WebSocketError.CONNECTION_TIMEOUT
    )
  }

  static INCOMPLETE_FRAME(msg = 'Incomplete frame', length = -1) {
    const err = new WebSocketError(msg, 'INCOMPLETE_FRAME', 0, WebSocketError.INCOMPLETE_FRAME)

    err.length = length

    return err
  }
}
