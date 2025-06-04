declare class WebSocketError extends Error {
  constructor(
    msg: string,
    code: string,
    status: number,
    fn?: WebSocketError,
    cause?: unknown
  )

  static NETWORK_ERROR(msg: string, cause?: unknown): WebSocketError
  static NOT_CONNECTED(msg?: string): WebSocketError
  static UNEXPECTED_RSV1(msg?: string): WebSocketError
  static UNEXPECTED_RSV2(msg?: string): WebSocketError
  static UNEXPECTED_RSV3(msg?: string): WebSocketError
  static EXPECTED_MASK(msg?: string): WebSocketError
  static EXPECTED_CONTINUATION(msg?: string): WebSocketError
  static UNEXPECTED_CONTINUATION(msg?: string): WebSocketError
  static UNEXPECTED_CONTROL(msg?: string): WebSocketError
  static INVALID_ENCODING(msg?: string): WebSocketError
  static INVALID_UPGRADE_HEADER(msg?: string): WebSocketError
  static INVALID_VERSION_HEADER(msg?: string): WebSocketError
  static INVALID_KEY_HEADER(msg?: string): WebSocketError
  static INVALID_ACCEPT_HEADER(msg?: string): WebSocketError
  static INVALID_OPCODE(msg?: string): WebSocketError
  static INVALID_PAYLOAD_LENGTH(msg?: string): WebSocketError
  static INCOMPLETE_FRAME(msg?: string, length?: number): WebSocketError
}

export = WebSocketError
