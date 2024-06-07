const ws = require('..')

const server = new ws.Server({ port: 8080 })

server.on('connection', (ws) => {
  ws.pipe(ws).on('close', () => console.log('Connection closed'))
})
