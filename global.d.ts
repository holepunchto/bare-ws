import * as ws from '.'

/** The type of the `Socket` class, used to type the global `WebSocket` constructor. */
type WebSocketConstructor = typeof ws.Socket

declare global {
  type WebSocket = ws.Socket

  const WebSocket: WebSocketConstructor
}
