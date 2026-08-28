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
   * The largest message accepted, in bytes, counted across every fragment it
   * is assembled from. A frame whose header declares more than the message has
   * left is refused before any of its payload is buffered. Reading a message
   * costs up to three times this while its fragments are held, copied out and
   * joined. Defaults to 100 MiB; -1 removes the limit.
   */
  maxPayload?: number

  /**
   * The most fragments a single message may be assembled from. Bounded apart
   * from `maxPayload` because an empty fragment costs a peer almost nothing.
   * Defaults to 1024; -1 removes the limit.
   */
  maxFragments?: number

  /**
   * The most chunks a single frame may be buffered from while it is still
   * incomplete. Bounded apart from `maxPayload`, which counts only the bytes a
   * chunk carries and not what holding on to the chunk itself costs, so a peer
   * that trickles its writes out could otherwise pile up parts indefinitely.
   * Defaults to 262144; -1 removes the limit.
   */
  maxBufferedChunks?: number

  /**
   * How long the connection may go without a byte from the peer before it is
   * dropped, in milliseconds. A ping goes out at half this interval, so an
   * idle but responsive peer is kept. Defaults to 120000; 0 disables it.
   *
   * This measures silence rather than progress. A peer part way through a
   * frame refreshes the budget with every byte it sends, so one that trickles
   * them out holds on to everything it has sent for as long as it keeps
   * sending; what that costs is bounded by `maxPayload` and
   * `maxBufferedChunks` rather than by time. Liveness beyond this, such as
   * requiring the peer to answer every ping or to finish what it started
   * within some deadline, is left to the application, since only it knows how
   * long its own messages may take to arrive.
   */
  idleTimeout?: number
}

interface WebSocketEvents extends DuplexEvents {
  /** Emitted with the payload of a ping frame received from the peer, which is answered with a pong automatically unless this side has already sent its close frame. */
  ping: [payload: Buffer]
  /** Emitted with the payload of a pong frame received from the peer. */
  pong: [payload: Buffer]
}

interface WebSocket<M extends WebSocketEvents = WebSocketEvents> extends Duplex<M> {
  /**
   * The status the peer closed with, once it has sent a close frame. `1005` if
   * the close frame carried no status, and `1006` until one arrives at all, so
   * a connection that went away without closing keeps it. Readable from a
   * `close` listener.
   */
  readonly closeCode: number

  /**
   * The reason the peer closed with, empty unless its close frame carried one
   * past the status. Readable from a `close` listener.
   */
  readonly closeReason: Buffer

  /**
   * Send a ping frame to the peer.
   * @param data - The payload of the ping frame, at most 125 bytes; a string is converted to a `Buffer`.
   * @throws {NOT_CONNECTED} the socket has not finished connecting, has closed, or has been ended, since nothing may follow the close frame that ending sends.
   * @throws {INVALID_CONTROL_PAYLOAD_LENGTH} `data` is longer than 125 bytes.
   * @throws {TypeError} `data` is neither a string nor a view of bytes.
   */
  ping(data?: string | Buffer): void
  /**
   * Send a pong frame to the peer.
   * @param data - The payload of the pong frame, at most 125 bytes; a string is converted to a `Buffer`.
   * @throws {NOT_CONNECTED} the socket has not finished connecting, has closed, or has been ended, since nothing may follow the close frame that ending sends.
   * @throws {INVALID_CONTROL_PAYLOAD_LENGTH} `data` is longer than 125 bytes.
   * @throws {TypeError} `data` is neither a string nor a view of bytes.
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
