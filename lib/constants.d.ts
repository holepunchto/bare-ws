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

export function isValidStatus(code: number): boolean

export const MAX_CONTROL_PAYLOAD_LENGTH: number
export const MAX_PAYLOAD_LENGTH: number
export const MAX_FRAGMENTS: number
export const IDLE_TIMEOUT: number
