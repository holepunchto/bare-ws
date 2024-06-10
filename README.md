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

## License

Apache-2.0
