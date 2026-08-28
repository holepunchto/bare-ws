declare class WebSocketError extends Error {
  constructor(msg: string, code: string, status: number, fn?: WebSocketError, cause?: unknown)

  readonly code: string
  readonly status: number

  static NETWORK_ERROR(msg: string, cause?: unknown): WebSocketError
  static NOT_CONNECTED(msg?: string): WebSocketError
  static UNEXPECTED_RSV1(msg?: string): WebSocketError
  static UNEXPECTED_RSV2(msg?: string): WebSocketError
  static UNEXPECTED_RSV3(msg?: string): WebSocketError
  static EXPECTED_MASK(msg?: string): WebSocketError
  static UNEXPECTED_MASK(msg?: string): WebSocketError
  static EXPECTED_CONTINUATION(msg?: string): WebSocketError
  static UNEXPECTED_CONTINUATION(msg?: string): WebSocketError
  static UNEXPECTED_CONTROL(msg?: string): WebSocketError
  static INVALID_ENCODING(msg?: string): WebSocketError
  static INVALID_METHOD(msg?: string): WebSocketError
  static INVALID_UPGRADE_HEADER(msg?: string): WebSocketError
  static INVALID_VERSION_HEADER(msg?: string): WebSocketError
  static INVALID_KEY_HEADER(msg?: string): WebSocketError
  static INVALID_ACCEPT_HEADER(msg?: string): WebSocketError
  static INVALID_UPGRADE_STATUS(msg?: string): WebSocketError
  static UPGRADE_REJECTED(msg?: string): WebSocketError
  static INVALID_OPCODE(msg?: string): WebSocketError
  static INVALID_PAYLOAD_LENGTH(msg?: string): WebSocketError
  static INVALID_CONTROL_PAYLOAD_LENGTH(msg?: string): WebSocketError
  static MESSAGE_TOO_LARGE(msg?: string): WebSocketError
  static TOO_MANY_FRAGMENTS(msg?: string): WebSocketError
  static INVALID_UTF8(msg?: string): WebSocketError
  static INVALID_CLOSE_PAYLOAD(msg?: string): WebSocketError
  static INVALID_CLOSE_STATUS(msg?: string): WebSocketError
  static CONNECTION_TIMEOUT(msg?: string): WebSocketError
  static INCOMPLETE_FRAME(msg?: string, length?: number): WebSocketError & { length: number }
}

export = WebSocketError
