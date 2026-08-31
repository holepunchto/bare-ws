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

  /** The error code, such as `'INVALID_OPCODE'`. */
  readonly code: string
  /** The close status reported to the peer before the connection is failed, or `0` for a condition that never reaches the wire. */
  readonly status: number

  /**
   * The underlying HTTP request errored before the handshake completed.
   * @param msg - The error message.
   * @param cause - The underlying error.
   * @returns A `WebSocketError` with `code` set to `'NETWORK_ERROR'`, for the caller to throw.
   */
  static NETWORK_ERROR(msg: string, cause?: unknown): WebSocketError
  /**
   * An operation, such as `ping()` or `pong()`, was attempted before the socket finished connecting, or after it closed.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'NOT_CONNECTED'`, for the caller to throw.
   */
  static NOT_CONNECTED(msg?: string): WebSocketError
  /**
   * A URL was given with a scheme other than `ws:`, `wss:`, `http:` or `https:`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_PROTOCOL'`, for the caller to throw.
   */
  static INVALID_PROTOCOL(msg?: string): WebSocketError
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
   * A frame from a server carried a mask, which only a client may set.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_MASK'`, for the caller to throw.
   */
  static UNEXPECTED_MASK(msg?: string): WebSocketError
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
   * A control frame was fragmented, which RFC 6455 does not allow.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_CONTROL'`, for the caller to throw.
   */
  static UNEXPECTED_CONTROL(msg?: string): WebSocketError
  /**
   * Data was written with an encoding other than `buffer` or `utf8`, or was not backed by bytes.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_ENCODING'`, for the caller to throw.
   */
  static INVALID_ENCODING(msg?: string): WebSocketError
  /**
   * The handshake request used a method other than `GET`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_METHOD'`, for the caller to throw.
   */
  static INVALID_METHOD(msg?: string): WebSocketError
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
   * The server's handshake response negotiated an extension, none of which this side ever offers.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_EXTENSION'`, for the caller to throw.
   */
  static UNEXPECTED_EXTENSION(msg?: string): WebSocketError
  /**
   * The server's handshake response named a subprotocol the client did not offer.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_PROTOCOL'`, for the caller to throw.
   */
  static UNEXPECTED_PROTOCOL(msg?: string): WebSocketError
  /**
   * The server's handshake response carried a status other than `101`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_UPGRADE_STATUS'`, for the caller to throw.
   */
  static INVALID_UPGRADE_STATUS(msg?: string): WebSocketError
  /**
   * A server's `verifyClient` refused the handshake.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UPGRADE_REJECTED'`, for the caller to throw.
   */
  static UPGRADE_REJECTED(msg?: string): WebSocketError
  /**
   * A frame was received with an opcode that is not `TEXT` or `BINARY`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_OPCODE'`, for the caller to throw.
   */
  static INVALID_OPCODE(msg?: string): WebSocketError
  /**
   * A frame declared a payload length beyond the safe integer range.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_PAYLOAD_LENGTH'`, for the caller to throw.
   */
  static INVALID_PAYLOAD_LENGTH(msg?: string): WebSocketError
  /**
   * A control frame carried more than the 125 bytes RFC 6455 allows, whether received or passed to `ping()` or `pong()`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_CONTROL_PAYLOAD_LENGTH'`, for the caller to throw.
   */
  static INVALID_CONTROL_PAYLOAD_LENGTH(msg?: string): WebSocketError
  /**
   * A frame or reassembled message exceeded `maxPayload`.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'MESSAGE_TOO_LARGE'`, for the caller to throw.
   */
  static MESSAGE_TOO_LARGE(msg?: string): WebSocketError
  /**
   * A message was assembled from more fragments than `maxFragments` allows.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'TOO_MANY_FRAGMENTS'`, for the caller to throw.
   */
  static TOO_MANY_FRAGMENTS(msg?: string): WebSocketError
  /**
   * A text frame or close reason was not well-formed UTF-8.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_UTF8'`, for the caller to throw.
   */
  static INVALID_UTF8(msg?: string): WebSocketError
  /**
   * A close frame carried a single byte, which is too short to hold a status.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_CLOSE_PAYLOAD'`, for the caller to throw.
   */
  static INVALID_CLOSE_PAYLOAD(msg?: string): WebSocketError
  /**
   * A close frame carried a status that no peer may send.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'INVALID_CLOSE_STATUS'`, for the caller to throw.
   */
  static INVALID_CLOSE_STATUS(msg?: string): WebSocketError
  /**
   * The connection went away before a close frame had been exchanged, so part of a message may have been lost.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'UNEXPECTED_CLOSE'`, for the caller to throw.
   */
  static UNEXPECTED_CLOSE(msg?: string): WebSocketError
  /**
   * No byte arrived from the peer within `idleTimeout`, and it did not answer the ping that followed.
   * @param msg - The error message.
   * @returns A `WebSocketError` with `code` set to `'CONNECTION_TIMEOUT'`, for the caller to throw.
   */
  static CONNECTION_TIMEOUT(msg?: string): WebSocketError
}

export = WebSocketError
