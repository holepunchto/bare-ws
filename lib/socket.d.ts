import { HTTPClientRequest } from 'bare-http1'
import { Socket as TCPSocket } from 'bare-tcp'
import { Duplex, type DuplexEvents } from 'bare-stream'
import URL from 'bare-url'
import Buffer from 'bare-buffer'
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

  /**
   * The largest message accepted, in bytes. A frame whose header declares more
   * is refused before its payload is buffered. Defaults to 100 MiB; -1 removes
   * the limit.
   */
  maxPayload?: number

  /**
   * The most fragments a single message may be assembled from. Bounded apart
   * from `maxPayload` because an empty fragment costs a peer almost nothing.
   * Defaults to 1024.
   */
  maxFragments?: number

  /**
   * How long the connection may go without a byte from the peer before it is
   * dropped, in milliseconds. A ping goes out at half this interval, so an idle
   * but responsive peer is kept. Defaults to 120000; 0 disables it.
   */
  idleTimeout?: number
}

interface WebSocketEvents extends DuplexEvents {
  /** Emitted with the payload of a ping frame received from the peer, which is answered with a pong automatically. */
  ping: [payload: Buffer]
  /** Emitted with the payload of a pong frame received from the peer. */
  pong: [payload: Buffer]
}

interface WebSocket<M extends WebSocketEvents = WebSocketEvents> extends Duplex<M> {
  /**
   * Send a ping frame to the peer.
   * @param data - The payload of the ping frame; a string is converted to a `Buffer`.
   * @throws {NOT_CONNECTED} the socket has not finished connecting.
   */
  ping(data?: string | Buffer): void
  /**
   * Send a pong frame to the peer.
   * @param data - The payload of the pong frame; a string is converted to a `Buffer`.
   * @throws {NOT_CONNECTED} the socket has not finished connecting.
   */
  pong(data?: string | Buffer): void
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
