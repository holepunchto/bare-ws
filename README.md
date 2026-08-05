# bare-ws

WebSocket library for JavaScript.

```
npm i bare-ws
```

## Usage

```js
const ws = require('bare-ws')

const server = new ws.Server({ port: 8080 }, (socket) => {
  socket.on('data', (data) => {
    console.log(data.toString())
  })
})

server.on('listening', () => {
  const socket = new ws.Socket({ port: 8080 })

  socket.write('Hello WebSocket')
})
```

<!--
  The API section below is generated from this module's shipped `.d.ts` by
  bare-refgen (holepunchto/pear-docs, scripts/bare-refgen; see
  holepunchto/pear-docs#326). Regenerate with `npm run emit:ts-doc` in that
  repo rather than editing by hand.
-->
<!-- bare-refgen:api start -->

## API

### Socket

#### `new Socket(opts: WebSocketOptions)`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/socket.d.ts#L27)

Open a WebSocket connection to `url`, or wrap an already-connected `opts.socket` when acting as the server side of a handshake.

Overloads:

```ts
new Socket(opts: WebSocketOptions)
new Socket(url: URL | string, opts?: WebSocketOptions)
```

**Parameters**

| Parameter | Type               | Default | Description                                                                                                |
| --------- | ------------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `opts`    | `WebSocketOptions` | —       | Connection options: `host`/`hostname`, `port`, `path`, `secure`, or an already-connected `socket` to wrap. |

#### `ping(data: unknown): void`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/socket.d.ts#L22)

Send a WebSocket ping frame with `data` as its payload.

**Parameters**

| Parameter | Type      | Default | Description                                                         |
| --------- | --------- | ------- | ------------------------------------------------------------------- |
| `data`    | `unknown` | —       | The payload of the ping frame; a string is converted to a `Buffer`. |

**Throws**

- `NOT_CONNECTED` — the socket has not finished connecting.

#### `pong(data: unknown): void`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/socket.d.ts#L23)

Send a WebSocket pong frame with `data` as its payload.

**Parameters**

| Parameter | Type      | Default | Description                                                         |
| --------- | --------- | ------- | ------------------------------------------------------------------- |
| `data`    | `unknown` | —       | The payload of the pong frame; a string is converted to a `Buffer`. |

**Throws**

- `NOT_CONNECTED` — the socket has not finished connecting.

#### `Socket.handshake(req: HTTPClientRequest, cb: (error: WebSocketError | null) => void): void`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/socket.d.ts#L34)

Perform the client side of the WebSocket opening handshake over `req`, calling `cb` with a `WebSocketError` if the server's response is invalid.

**Parameters**

| Parameter | Type                                      | Default | Description                                                                                           |
| --------- | ----------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `req`     | `HTTPClientRequest`                       | —       | The outgoing HTTP request to upgrade; the WebSocket handshake headers are added to it.                |
| `cb`      | `(error: WebSocketError \| null) => void` | —       | Called once the server's response is validated, with a `WebSocketError` on failure, otherwise `null`. |

#### `Socket.WebSocketEvents`

```ts
interface WebSocketEvents extends DuplexEvents {
  ping: [payload: unknown]
  pong: [payload: unknown]
}
```

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/socket.d.ts#L16)

#### `Socket.WebSocketOptions`

```ts
interface WebSocketOptions {
  host?: string
  hostname?: string
  path?: string
  port?: string | number
  secure?: boolean
  socket?: TCPSocket
}
```

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/socket.d.ts#L7)

### Server

#### `new Server(onconnection: (socket: WebSocket, req: HTTPClientRequest) => void)`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L31)

Create a server, optionally backed by `opts.server`, and emit `connection` for each successful WebSocket upgrade.

Overloads:

```ts
new Server(onconnection: (socket: WebSocket, req: HTTPClientRequest) => void)
new Server(opts?: WebSocketServerOptions, onconnection?: (socket: WebSocket, req: HTTPClientRequest) => void)
```

**Parameters**

| Parameter      | Type                                                  | Default | Description                          |
| -------------- | ----------------------------------------------------- | ------- | ------------------------------------ |
| `onconnection` | `(socket: WebSocket, req: HTTPClientRequest) => void` | —       | Called on each `'connection'` event. |

#### `address(): TCPSocketAddress`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L24)

Return the bound address of the underlying TCP server.

#### `close(cb?: (err?: Error | null) => void): this`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L25)

Stop the server from accepting new connections, calling `cb` once it has closed.

**Parameters**

| Parameter | Type                            | Default | Description                                   |
| --------- | ------------------------------- | ------- | --------------------------------------------- |
| `cb?`     | `(err?: Error \| null) => void` | —       | Called once the underlying server has closed. |

#### `listening: boolean`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L22)

`true` once the underlying server is bound and accepting connections.

#### `ref(): this`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L26)

Ref the underlying server so it keeps the event loop alive.

#### `Server.handshake(req: HTTPClientRequest, cb: (err: WebSocketError | null) => void): void`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L42)

Perform the server side of the WebSocket opening handshake for `req`, writing the `101` upgrade response on `socket` and calling `cb` with a `WebSocketError` on failure.

Overloads:

```ts
Server.handshake(req: HTTPClientRequest, cb: (err: WebSocketError | null) => void): void
Server.handshake(req: HTTPClientRequest, socket: TCPSocket, cb?: (err: WebSocketError | null) => void): void
Server.handshake(req: HTTPClientRequest, socket?: TCPSocket, head?: Buffer, cb?: (err: WebSocketError | null) => void): void
```

**Parameters**

| Parameter | Type                                    | Default | Description                                                                                       |
| --------- | --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `req`     | `HTTPClientRequest`                     | —       | The incoming upgrade request.                                                                     |
| `cb`      | `(err: WebSocketError \| null) => void` | —       | Called with a `WebSocketError` if the request is not a valid WebSocket upgrade, otherwise `null`. |

#### `Server.WebSocketServerEvents`

```ts
interface WebSocketServerEvents extends DuplexEvents {
  connection: [socket: WebSocket, req: HTTPClientRequest]
  listening: []
}
```

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L14)

#### `Server.WebSocketServerOptions`

```ts
interface WebSocketServerOptions extends HTTPServerConnectionOptions, HTTPSServerConnectionOptions {
  secure?: boolean
}
```

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L10)

#### `unref(): this`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/server.d.ts#L27)

Unref the underlying server so it does not keep the event loop alive on its own.

## `bare-ws/global`

### Types

#### `WebSocketConstructor`

```ts
type WebSocketConstructor = typeof ws.Socket
```

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/global.d.ts#L3)

The type of the `Socket` class, used to type the global `WebSocket` constructor.

## `bare-ws/constants`

### Constants and variables

#### `EOL: string`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/constants.d.ts#L3)

The line ending (`\r\n`) used when writing the handshake response.

#### `EOF: string`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/constants.d.ts#L4)

The blank-line terminator (`\r\n\r\n`) that ends the handshake response headers.

#### `GUID: Buffer`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/constants.d.ts#L6)

The WebSocket protocol's fixed GUID, concatenated with the `Sec-WebSocket-Key` to compute the `Sec-WebSocket-Accept` digest.

#### `opcode`

```ts
opcode: {
  CONTINUATION: number
  TEXT: number
  BINARY: number
  CLOSE: number
  PING: number
  PONG: number
}
```

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/constants.d.ts#L8)

The WebSocket frame opcodes (`CONTINUATION`, `TEXT`, `BINARY`, `CLOSE`, `PING`, `PONG`) as defined by RFC 6455.

#### `status: { PROTOCOL_ERROR: number; MESSAGE_TOO_LARGE: number }`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/constants.d.ts#L17)

WebSocket close status codes for protocol errors (`PROTOCOL_ERROR`) and oversized messages (`MESSAGE_TOO_LARGE`).

## `bare-ws/errors`

### WebSocketError

#### `WebSocketError`

```ts
new WebSocketError(msg: string, code: string, status: number, fn?: WebSocketError, cause?: unknown)
```

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L2)

An error thrown for WebSocket protocol violations, carrying a `code` and a close `status`.

**Parameters**

| Parameter | Type             | Default | Description                                                                                               |
| --------- | ---------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `msg`     | `string`         | —       | The error message.                                                                                        |
| `code`    | `string`         | —       | The error code.                                                                                           |
| `status`  | `number`         | —       | The WebSocket close status associated with the error.                                                     |
| `fn?`     | `WebSocketError` | —       | Optional function to omit from the top of the generated stack trace, passed to `Error.captureStackTrace`. |
| `cause?`  | `unknown`        | —       | The underlying cause of the error, if any.                                                                |

#### `WebSocketError.EXPECTED_CONTINUATION(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L10)

A fragmented message's next frame was not a continuation frame.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'EXPECTED_CONTINUATION'`, for the caller to throw.

#### `WebSocketError.EXPECTED_MASK(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L9)

A frame from a client was missing its required mask.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'EXPECTED_MASK'`, for the caller to throw.

#### `WebSocketError.INCOMPLETE_FRAME(msg?: string, length?: number): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L20)

The buffered data does not yet contain a full frame.

**Parameters**

| Parameter | Type     | Default | Description                                                                                                  |
| --------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `msg?`    | `string` | —       | The error message.                                                                                           |
| `length?` | `number` | —       | The total byte length the frame needs before it can be decoded, stored as the error `status` (default `-1`). |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INCOMPLETE_FRAME'` and `status` set to `length`, for the caller to throw.

#### `WebSocketError.INVALID_ACCEPT_HEADER(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L17)

The `Sec-WebSocket-Accept` header in the server's handshake response did not match the expected digest.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INVALID_ACCEPT_HEADER'`, for the caller to throw.

#### `WebSocketError.INVALID_ENCODING(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L13)

Data was written with an encoding other than `buffer` or `utf8`.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INVALID_ENCODING'`, for the caller to throw.

#### `WebSocketError.INVALID_KEY_HEADER(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L16)

The `Sec-WebSocket-Key` header was missing or malformed.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INVALID_KEY_HEADER'`, for the caller to throw.

#### `WebSocketError.INVALID_OPCODE(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L18)

A frame was received with an opcode that is not `TEXT` or `BINARY`.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INVALID_OPCODE'`, for the caller to throw.

#### `WebSocketError.INVALID_PAYLOAD_LENGTH(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L19)

A frame's payload length field was invalid.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INVALID_PAYLOAD_LENGTH'`, for the caller to throw.

#### `WebSocketError.INVALID_UPGRADE_HEADER(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L14)

The `Upgrade` header was missing or not `websocket`.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INVALID_UPGRADE_HEADER'`, for the caller to throw.

#### `WebSocketError.INVALID_VERSION_HEADER(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L15)

The `Sec-WebSocket-Version` header was neither `8` nor `13`.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'INVALID_VERSION_HEADER'`, for the caller to throw.

#### `WebSocketError.NETWORK_ERROR(msg: string, cause?: unknown): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L4)

The underlying HTTP request errored before the handshake completed.

**Parameters**

| Parameter | Type      | Default | Description           |
| --------- | --------- | ------- | --------------------- |
| `msg`     | `string`  | —       | The error message.    |
| `cause?`  | `unknown` | —       | The underlying error. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'NETWORK_ERROR'`, for the caller to throw.

#### `WebSocketError.NOT_CONNECTED(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L5)

An operation, such as `ping()` or `pong()`, was attempted before the socket finished connecting.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'NOT_CONNECTED'`, for the caller to throw.

#### `WebSocketError.UNEXPECTED_CONTINUATION(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L11)

A continuation frame was received without a preceding fragmented frame.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'UNEXPECTED_CONTINUATION'`, for the caller to throw.

#### `WebSocketError.UNEXPECTED_CONTROL(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L12)

A control frame was received while a fragmented message was in progress.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'UNEXPECTED_CONTROL'`, for the caller to throw.

#### `WebSocketError.UNEXPECTED_RSV1(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L6)

A frame was received with the reserved RSV1 bit set.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'UNEXPECTED_RSV1'`, for the caller to throw.

#### `WebSocketError.UNEXPECTED_RSV2(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L7)

A frame was received with the reserved RSV2 bit set.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'UNEXPECTED_RSV2'`, for the caller to throw.

#### `WebSocketError.UNEXPECTED_RSV3(msg?: string): WebSocketError`

[source](https://github.com/holepunchto/bare-ws/blob/v3.0.0/lib/errors.d.ts#L8)

A frame was received with the reserved RSV3 bit set.

**Parameters**

| Parameter | Type     | Default | Description        |
| --------- | -------- | ------- | ------------------ |
| `msg?`    | `string` | —       | The error message. |

**Returns** `WebSocketError` — A `WebSocketError` with `code` set to `'UNEXPECTED_RSV3'`, for the caller to throw.

<!-- bare-refgen:api end -->

## License

Apache-2.0
