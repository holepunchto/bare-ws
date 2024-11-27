const test = require('brittle')
const fs = require('bare-fs')
const ws = require('.')

const options = {
  cert: fs.readFileSync('test/fixtures/cert.crt'),
  key: fs.readFileSync('test/fixtures/cert.key')
}

test('basic', async (t) => {
  t.plan(3)

  const server = new ws.Server({ port: 8080 })

  server.on('connection', (ws) => {
    ws.on('data', (data) => {
      t.alike(data, Buffer.from('hello'))

      ws.end()
    }).on('close', () => {
      server.close(() => {
        t.pass('server closed')
      })
    })
  })

  server.on('listening', () => {
    t.pass('listening')

    const client = new ws.Socket({ port: 8080 })

    client.end('hello')
  })
})

test('secure', async (t) => {
  t.plan(3)

  const server = new ws.Server({ port: 8080, secure: true, ...options })

  server.on('connection', (ws) => {
    ws.on('data', (data) => {
      t.alike(data, Buffer.from('hello'))

      ws.end()
    }).on('close', () => {
      server.close(() => {
        t.pass('server closed')
      })
    })
  })

  server.on('listening', () => {
    t.pass('listening')

    const client = new ws.Socket({ port: 8080, secure: true })

    client.end('hello')
  })
})

test('ping pong', async (t) => {
  t.plan(4)

  const server = new ws.Server({ port: 8080 })

  server.on('connection', (ws) => {
    ws.on('ping', (data) => {
      t.alike(data, Buffer.from('hello'), 'received ping')

      ws.end()
    }).on('close', () => {
      server.close(() => {
        t.pass('server closed')
      })
    })
  })

  server.on('listening', () => {
    t.pass('listening')

    const client = new ws.Socket({ port: 8080 })

    client
      .on('pong', (data) =>
        t.alike(data, Buffer.from('hello'), 'received pong')
      )
      .on('open', () => client.ping('hello'))
  })
})
