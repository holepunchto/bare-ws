const { status } = require('./constants')

module.exports = class WebSocketError extends Error {
  constructor (msg, code, status, fn = WebSocketError) {
    super(`${code}: ${msg}`)
    this.code = code
    this.status = status

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name () {
    return 'WebSocketError'
  }

  static EXPECTED_MASK (msg = 'MASK must be set') {
    return new WebSocketError(msg, 'EXPECTED_MASK', status.PROTOCOL_ERROR, WebSocketError.EXPECTED_MASK)
  }

  static UNEXPECTED_MASK (msg = 'MASK must be unset') {
    return new WebSocketError(msg, 'UNEXPECTED_MASK', status.PROTOCOL_ERROR, WebSocketError.UNEXPECTED_MASK)
  }
}
