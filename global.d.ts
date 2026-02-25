import * as ws from '.'

type WebSocketConstructor = typeof ws.Socket

declare global {
  type WebSocket = ws.Socket

  const WebSocket: WebSocketConstructor
}
