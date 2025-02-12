declare class WebSocketError extends Error {
  constructor(
    msg: string,
    code: string,
    status: number,
    fn?: WebSocketError,
    cause?: unknown
  )

  static NETWORK_ERROR(msg: string, cause?: unknown): WebSocketError
  static NOT_CONNECTED(msg?: string, cause?: unknown): WebSocketError
  static UNEXPECTED_RSV1(msg?: string, cause?: unknown): WebSocketError
  static UNEXPECTED_RSV2(msg?: string, cause?: unknown): WebSocketError
  static UNEXPECTED_RSV3(msg?: string, cause?: unknown): WebSocketError
  static EXPECTED_MASK(msg?: string, cause?: unknown): WebSocketError
  static EXPECTED_CONTINUATION(msg?: string, cause?: unknown): WebSocketError
  static UNEXPECTED_CONTINUATION(msg?: string, cause?: unknown): WebSocketError
  static UNEXPECTED_CONTROL(msg?: string, cause?: unknown): WebSocketError
  static INVALID_ENCODING(msg?: string, cause?: unknown): WebSocketError
  static INVALID_UPGRADE_HEADER(msg?: string, cause?: unknown): WebSocketError
  static INVALID_VERSION_HEADER(msg?: string, cause?: unknown): WebSocketError
  static INVALID_KEY_HEADER(msg?: string, cause?: unknown): WebSocketError
  static INVALID_ACCEPT_HEADER(msg?: string, cause?: unknown): WebSocketError
  static INVALID_OPCODE(msg?: string, cause?: unknown): WebSocketError
  static INVALID_PAYLOAD_LENGTH(msg?: string, cause?: unknown): WebSocketError
}

export = WebSocketError
