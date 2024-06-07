const test = require('brittle')
const ws = require('.')

test('basic', async (t) => {
  t.plan(3)

  const server = new ws.Server({ port: 8080 })

  server.on('connection', (ws) => {
    ws
      .on('data', (data) => t.alike(data, Buffer.from('hello')))
      .end()

    server.close(() => {
      t.pass('server closed')
    })
  })

  server.on('listening', () => {
    t.pass('listening')

    const client = new ws.Socket({ port: 8080 })

    client.end('hello')
  })
})
