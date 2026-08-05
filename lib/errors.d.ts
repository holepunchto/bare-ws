/** An error thrown for WebSocket protocol violations, carrying a `code` and a close `status`. */
declare class WebSocketError extends Error {
  /**
   * @param msg - The error message.
   * @param code - The error code.
   * @param status - The WebSocket close status associated with the error.
   * @param fn - Optional function to omit from the top of the generated stack trace, passed to `Error.captureStackTrace`.
   * @param cause - The underlying cause of the error, if any.
   */
  constructor(msg: string, code: string, status: number, fn?: WebSocketError, cause?: unknown)

  /**
   * The underlying HTTP request errored before the handshake completed.
   * @param msg - The error message.
   * @param cause - The underlying error.
   * @returns A `WebSocketError` with `code` set to `'NETWORK_ERROR'`, for the caller to throw.
   */
  static NETWORK_ERROR(msg: string, cause?: unknown): WebSocketError
  /**
   * An operation, such as `ping()` or `pong()`, was attempted before the socket finished connecting.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'NOT_CONNECTED'`, for the caller to throw.
   */
  static NOT_CONNECTED(msg?: string): WebSocketError
  /**
   * A frame was received with the reserved RSV1 bit set.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_RSV1'`, for the caller to throw.
   */
  static UNEXPECTED_RSV1(msg?: string): WebSocketError
  /**
   * A frame was received with the reserved RSV2 bit set.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_RSV2'`, for the caller to throw.
   */
  static UNEXPECTED_RSV2(msg?: string): WebSocketError
  /**
   * A frame was received with the reserved RSV3 bit set.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_RSV3'`, for the caller to throw.
   */
  static UNEXPECTED_RSV3(msg?: string): WebSocketError
  /**
   * A frame from a client was missing its required mask.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'EXPECTED_MASK'`, for the caller to throw.
   */
  static EXPECTED_MASK(msg?: string): WebSocketError
  /**
   * A fragmented message's next frame was not a continuation frame.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'EXPECTED_CONTINUATION'`, for the caller to throw.
   */
  static EXPECTED_CONTINUATION(msg?: string): WebSocketError
  /**
   * A continuation frame was received without a preceding fragmented frame.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_CONTINUATION'`, for the caller to throw.
   */
  static UNEXPECTED_CONTINUATION(msg?: string): WebSocketError
  /**
   * A control frame was received while a fragmented message was in progress.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_CONTROL'`, for the caller to throw.
   */
  static UNEXPECTED_CONTROL(msg?: string): WebSocketError
  /**
   * Data was written with an encoding other than `buffer` or `utf8`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_ENCODING'`, for the caller to throw.
   */
  static INVALID_ENCODING(msg?: string): WebSocketError
  /**
   * The `Upgrade` header was missing or not `websocket`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_UPGRADE_HEADER'`, for the caller to throw.
   */
  static INVALID_UPGRADE_HEADER(msg?: string): WebSocketError
  /**
   * The `Sec-WebSocket-Version` header was neither `8` nor `13`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_VERSION_HEADER'`, for the caller to throw.
   */
  static INVALID_VERSION_HEADER(msg?: string): WebSocketError
  /**
   * The `Sec-WebSocket-Key` header was missing or malformed.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_KEY_HEADER'`, for the caller to throw.
   */
  static INVALID_KEY_HEADER(msg?: string): WebSocketError
  /**
   * The `Sec-WebSocket-Accept` header in the server's handshake response did not match the expected digest.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_ACCEPT_HEADER'`, for the caller to throw.
   */
  static INVALID_ACCEPT_HEADER(msg?: string): WebSocketError
  /**
   * A frame was received with an opcode that is not `TEXT` or `BINARY`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_OPCODE'`, for the caller to throw.
   */
  static INVALID_OPCODE(msg?: string): WebSocketError
  /**
   * A frame's payload length field was invalid.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_PAYLOAD_LENGTH'`, for the caller to throw.
   */
  static INVALID_PAYLOAD_LENGTH(msg?: string): WebSocketError
  /**
   * The buffered data does not yet contain a full frame.
   * @param msg - The error message.
   * @param length - The total byte length the frame needs before it can be decoded, stored as the error `status` (default `-1`).
   * @returns A `WebSocketError` with `code` set to `'INCOMPLETE_FRAME'` and `status` set to `length`, for the caller to throw.
   */
  static INCOMPLETE_FRAME(msg?: string, length?: number): WebSocketError
}

export = WebSocketError
