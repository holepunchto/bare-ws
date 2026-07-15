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

/** WebSocket close status codes for protocol errors (`PROTOCOL_ERROR`) and oversized messages (`MESSAGE_TOO_LARGE`). */
export const status: { PROTOCOL_ERROR: number; MESSAGE_TOO_LARGE: number }
