import { type HTTPSServerConnectionOptions } from 'bare-https'
import { HTTPClientRequest, type HTTPServerConnectionOptions } from 'bare-http1'
import { Socket as TCPSocket, type TCPSocketAddress } from 'bare-tcp'
import { type DuplexEvents } from 'bare-stream'
import EventEmitter from 'bare-events'
import Buffer from 'bare-buffer'
import WebSocket, { type WebSocketOptions } from './socket'
import WebSocketError from './errors'

interface WebSocketServerOptions
  extends
    HTTPServerConnectionOptions,
    HTTPSServerConnectionOptions,
    Pick<
      WebSocketOptions,
      | 'maxPayload'
      | 'maxFragments'
      | 'maxBufferedChunks'
      | 'minBufferedChunks'
      | 'minChunkAverage'
      | 'idleTimeout'
    > {
  secure?: boolean

  /**
   * Called with the upgrade request before the 101 response is written. Return
   * `false`, or a promise resolving to `false`, to refuse the handshake; the
   * peer is answered `403` and the connection is dropped. This is where an
   * `Origin` or credential check belongs, since neither is performed for you.
   */
  verifyClient?: (req: HTTPClientRequest) => boolean | Promise<boolean>
}

interface WebSocketServerEvents extends DuplexEvents {
  /** Emitted with the new `WebSocket` and the originating request after a successful handshake. */
  connection: [socket: WebSocket, req: HTTPClientRequest]
  listening: []
  handshakeError: [err: WebSocketError, socket: TCPSocket]
}

interface WebSocketServer<
  M extends WebSocketServerEvents = WebSocketServerEvents
> extends EventEmitter<M> {
  readonly listening: boolean

  /**
   * The connections the server has open. A socket handed over by an upgrade is
   * no longer the underlying HTTP server's to close, so these are tracked here
   * and closed by `close`.
   */
  readonly connections: Set<WebSocket>

  /** Return the bound address of the underlying TCP server. */
  address(): TCPSocketAddress
  /**
   * Stop the server from accepting new connections and close the ones it has
   * open, calling `cb` once it has closed. Each connection is sent a close
   * frame and dropped if it has not closed within five seconds, since
   * otherwise a peer that stops taking part would keep the server from ever
   * closing.
   * @param cb - Called once the underlying server has closed.
   */
  close(cb?: (err?: Error | null) => void): this
  /** Ref the underlying server so it keeps the event loop alive. */
  ref(): this
  /** Unref the underlying server so it does not keep the event loop alive on its own. */
  unref(): this
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

  export function handshake(req: HTTPClientRequest, cb: (err: WebSocketError | null) => void): void

  export function handshake(
    req: HTTPClientRequest,
    socket: TCPSocket,
    cb: (err: WebSocketError | null) => void
  ): void

  export function handshake(
    req: HTTPClientRequest,
    socket: TCPSocket,
    head: Buffer,
    cb: (err: WebSocketError | null) => void
  ): void
}

export = WebSocketServer
