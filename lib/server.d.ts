import { type HTTPSServerConnectionOptions } from 'bare-https'
import { HTTPIncomingMessage, type HTTPServerConnectionOptions } from 'bare-http1'
import { Socket as TCPSocket, type TCPSocketAddress } from 'bare-tcp'
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
   * How long a handshake has to finish, in milliseconds, counted from the
   * moment the connection is handed over by the HTTP server. This is what
   * bounds a `verifyClient` that never settles, since nothing else does: the
   * idle timeout is not armed until the socket has been handed over. A peer
   * that runs out of time is answered `408` and dropped. Defaults to 30000;
   * 0 disables it.
   */
  handshakeTimeout?: number

  /**
   * How long a connection has to close of its own accord once it has been
   * asked to, in milliseconds, before it is dropped. Bounds both the peer that
   * never answers a close frame and the one that stops reading before a
   * response has flushed, so that closing the server does not wait on either.
   * Passed on to every connection. Defaults to 5000; 0 removes the bound.
   */
  closeTimeout?: number

  /**
   * Called with the upgrade request before the 101 response is written. Return
   * `false`, or a promise resolving to `false`, to refuse the handshake; the
   * peer is answered `403` and the connection is dropped. This is where an
   * `Origin` or credential check belongs, since neither is performed for you.
   */
  verifyClient?: (req: HTTPIncomingMessage) => boolean | Promise<boolean>
}

interface WebSocketServerEvents {
  /** Emitted with the new `WebSocket` and the originating request after a successful handshake. */
  connection: [socket: WebSocket, req: HTTPIncomingMessage]
  /** Emitted once the underlying server is listening. */
  listening: []
  /** Emitted once the underlying server has closed. */
  close: []
  /** Emitted with an error reported by the underlying server, such as a failure to bind. */
  error: [err: Error]
  /**
   * Emitted with the error a handshake was refused over and the socket it was
   * refused on, which has already been answered and is being dropped. Reported
   * apart from `error` so that a malformed request cannot take down a server
   * that is not listening for one.
   */
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
  constructor(onconnection: (socket: WebSocket, req: HTTPIncomingMessage) => void)

  constructor(
    opts?: WebSocketServerOptions,
    onconnection?: (socket: WebSocket, req: HTTPIncomingMessage) => void
  )
}

declare namespace WebSocketServer {
  export { type WebSocketServerOptions, type WebSocketServerEvents }

  export function handshake(
    req: HTTPIncomingMessage,
    cb: (err: WebSocketError | null) => void
  ): void

  export function handshake(
    req: HTTPIncomingMessage,
    socket: TCPSocket,
    cb: (err: WebSocketError | null) => void
  ): void

  export function handshake(
    req: HTTPIncomingMessage,
    socket: TCPSocket,
    head: Buffer,
    cb: (err: WebSocketError | null) => void
  ): void
}

export = WebSocketServer
