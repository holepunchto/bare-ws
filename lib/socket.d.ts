import { HTTPClientRequest } from 'bare-http1'
import { Socket as TCPSocket } from 'bare-tcp'
import { Duplex, type DuplexEvents } from 'bare-stream'
import URL from 'bare-url'
import WebSocketError from './errors'

interface WebSocketOptions {
  host?: string
  hostname?: string
  path?: string
  port?: string | number
  secure?: boolean
  socket?: TCPSocket
}

interface WebSocketEvents extends DuplexEvents {
  ping: [payload: unknown]
  pong: [payload: unknown]
}

interface WebSocket<M extends WebSocketEvents = WebSocketEvents>
  extends Duplex<M> {
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
