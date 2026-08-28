import Buffer from 'bare-buffer'

/** The line ending (`\r\n`) used when writing the handshake response. */
export const EOL: string
/** The blank-line terminator (`\r\n\r\n`) that ends the handshake response headers. */
export const EOF: string

/** The WebSocket protocol's fixed GUID, concatenated with the `Sec-WebSocket-Key` to compute the `Sec-WebSocket-Accept` digest. */
export const GUID: Buffer

/** The WebSocket frame opcodes (`CONTINUATION`, `TEXT`, `BINARY`, `CLOSE`, `PING`, `PONG`) as defined by RFC 6455. */
export const opcode: {
  CONTINUATION: number
  TEXT: number
  BINARY: number
  CLOSE: number
  PING: number
  PONG: number
}

/** The WebSocket close status codes defined by RFC 6455 and the IANA registry. */
export const status: {
  NORMAL_CLOSURE: number
  GOING_AWAY: number
  PROTOCOL_ERROR: number
  UNSUPPORTED_DATA: number
  NO_STATUS_RECEIVED: number
  ABNORMAL_CLOSURE: number
  INVALID_PAYLOAD: number
  POLICY_VIOLATION: number
  MESSAGE_TOO_LARGE: number
  MISSING_EXTENSION: number
  INTERNAL_ERROR: number
  SERVICE_RESTART: number
  TRY_AGAIN_LATER: number
  BAD_GATEWAY: number
  TLS_HANDSHAKE_FAILURE: number
}

/**
 * Whether a close status may be sent in a close frame.
 * @param code - The close status to check.
 * @returns `false` outside the registered ranges, for the reserved `1004`, and for the three codes only a local endpoint may report.
 */
export function isValidStatus(code: number): boolean

/** The largest payload a control frame may carry (`125`), as defined by RFC 6455. */
export const MAX_CONTROL_PAYLOAD_LENGTH: number
/** The default `maxPayload`, in bytes. */
export const MAX_PAYLOAD_LENGTH: number
/** The default `maxFragments`. */
export const MAX_FRAGMENTS: number
/** The default `maxBufferedChunks`. */
export const MAX_BUFFERED_CHUNKS: number
/** The default `minChunkAverage`, in bytes. */
export const MIN_CHUNK_AVERAGE: number
/** The default `minBufferedChunks`. */
export const MIN_BUFFERED_CHUNKS: number
/** The default `handshakeTimeout`, in milliseconds. */
export const HANDSHAKE_TIMEOUT: number
/** The default `idleTimeout`, in milliseconds. */
export const IDLE_TIMEOUT: number
/** How long a connection has to close of its own accord once it has been asked to, in milliseconds, before it is dropped. */
export const CLOSE_TIMEOUT: number
