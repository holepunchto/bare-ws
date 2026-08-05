import { HTTPClientRequest } from 'bare-http1'
import { Socket as TCPSocket } from 'bare-tcp'
import { Duplex, type DuplexEvents } from 'bare-stream'
import URL from 'bare-url'
import WebSocketError from './errors'

interface WebSocketOptions {
  /** The host to connect to. */
  host?: string
  /** Alias for `host`, accepted for Node.js compatibility. */
  hostname?: string
  /** The request path used in the handshake. */
  path?: string
  /** The port to connect to. */
  port?: string | number
  secure?: boolean
  /** An already-connected TCP socket to use instead of opening a new connection. */
  socket?: TCPSocket
}

interface WebSocketEvents extends DuplexEvents {
  /**
   * @param data - The payload of the ping frame; a string is converted to a `Buffer`.
   * @throws {NOT_CONNECTED} the socket has not finished connecting.
   */
  ping: [payload: unknown]
  /**
   * @param data - The payload of the pong frame; a string is converted to a `Buffer`.
   * @throws {NOT_CONNECTED} the socket has not finished connecting.
   */
  pong: [payload: unknown]
}

interface WebSocket<M extends WebSocketEvents = WebSocketEvents> extends Duplex<M> {
  ping(data: unknown): void
  pong(data: unknown): void
}

declare class WebSocket {
  constructor(opts: WebSocketOptions)
  constructor(url: URL | string, opts?: WebSocketOptions)
}

declare namespace WebSocket {
  export { type WebSocketOptions, type WebSocketEvents }

  export function handshake(
    req: HTTPClientRequest,
    cb: (error: WebSocketError | null) => void
  ): void
}

export = WebSocket
