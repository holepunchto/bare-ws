import Buffer from 'bare-buffer'

export const EOL: string
export const EOF: string

export const GUID: Buffer

export const opcode: {
  CONTINUATION: number
  TEXT: number
  BINARY: number
  CLOSE: number
  PING: number
  PONG: number
}

export const status: { PROTOCOL_ERROR: number; MESSAGE_TOO_LARGE: number }
