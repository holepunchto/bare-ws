import { type HTTPSServerConnectionOptions } from 'bare-https'
import { HTTPClientRequest, type HTTPServerConnectionOptions } from 'bare-http1'
import { Socket as TCPSocket, type TCPSocketAddress } from 'bare-tcp'
import { type DuplexEvents } from 'bare-stream'
import EventEmitter from 'bare-events'
import Buffer from 'bare-buffer'
import WebSocket from './socket'
import WebSocketError from './errors'

interface WebSocketServerOptions
  extends HTTPServerConnectionOptions,
    HTTPSServerConnectionOptions {
  secure?: boolean
}

interface WebSocketServerEvents extends DuplexEvents {
  connection: [socket: WebSocket, req: HTTPClientRequest]
  listening: []
}

interface WebSocketServer<
  M extends WebSocketServerEvents = WebSocketServerEvents
> extends EventEmitter<M> {
  readonly listening: boolean

  address(): TCPSocketAddress
  close(cb?: (err: WebSocketError | null) => void): void
  ref(): void
  unref(): void
}

declare class WebSocketServer {
  constructor(onconnection: (socket: WebSocket, req: HTTPClientRequest) => void)

  constructor(
    opts?: WebSocketServerOptions,
    onconnection?: (socket: WebSocket, req: HTTPClientRequest) => void
  )
}

declare namespace WebSocketServer {
  export { type WebSocketServerOptions, type WebSocketServerEvents }

  export function handshake(
    req: HTTPClientRequest,
    cb: (err: WebSocketError | null) => void
  ): void

  export function handshake(
    req: HTTPClientRequest,
    socket: TCPSocket,
    cb?: (err: WebSocketError | null) => void
  ): void

  export function handshake(
    req: HTTPClientRequest,
    socket?: TCPSocket,
    head?: Buffer,
    cb?: (err: WebSocketError | null) => void
  ): void
}

export = WebSocketServer
