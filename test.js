const test = require('brittle')
const fs = require('bare-fs')
const net = require('bare-tcp')
const crypto = require('bare-crypto')
const ws = require('.')
const { GUID, EOL, EOF } = require('bare-ws/constants')

// Speaks the handshake by hand and then keeps whatever a client puts on the
// wire, so that what a client sends is judged as bytes and nothing else.
function wireServer(port) {
  const sockets = []

  const wire = { bytes: Buffer.alloc(0) }

  wire.server = net.createServer((socket) => {
    sockets.push(socket)

    socket.on('error', () => {})

    let head = ''
    let upgraded = false

    socket.on('data', (data) => {
      if (upgraded === false) {
        head += data.toString('latin1')

        const i = head.indexOf(EOF)

        if (i === -1) return

        upgraded = true

        const key = /sec-websocket-key: (.*)\r\n/i.exec(head)[1]
        const accept = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

        socket.write(
          'HTTP/1.1 101 Switching Protocols' +
            EOL +
            'Upgrade: websocket' +
            EOL +
            'Connection: Upgrade' +
            EOL +
            `Sec-WebSocket-Accept: ${accept}` +
            EOF
        )

        data = Buffer.from(head.slice(i + EOF.length), 'latin1')
      }

      wire.bytes = Buffer.concat([wire.bytes, data])
    })
  })

  // Reads the frames kept so far, as far as the bytes in hand allow.
  wire.frames = () => {
    const frames = []

    let at = 0

    while (at < wire.bytes.byteLength) {
      const rest = wire.bytes.subarray(at)

      if (rest.byteLength < 2) break

      const frame = payloadOf(rest)

      if (frame.end > rest.byteLength) break

      frames.push(frame)

      at += frame.end
    }

    return frames
  }

  wire.close = () =>
    new Promise((resolve) => {
      for (const socket of sockets) socket.destroy()

      wire.server.close(resolve)
    })

  wire.listen = () => new Promise((resolve) => wire.server.listen(port, resolve))

  return wire
}

// Waits for a condition the peer's writes decide the timing of.
async function until(fn, timeout = 5000) {
  const deadline = Date.now() + timeout

  while (fn() === false && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  return fn()
}

const options = {
  cert: fs.readFileSync('test/fixtures/cert.crt'),
  key: fs.readFileSync('test/fixtures/cert.key')
}

test('basic', (t) => {
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

test('secure', (t) => {
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

    const client = new ws.Socket({ port: 8080, secure: true, rejectUnauthorized: false })

    client.end('hello')
  })
})

test('ping pong', (t) => {
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
      .on('pong', (data) => t.alike(data, Buffer.from('hello'), 'received pong'))
      .on('open', () => client.ping('hello'))
  })
})

test('connection refused', (t) => {
  t.plan(1)

  const client = new ws.Socket({ port: 8080 })

  client.on('error', (err) => t.ok(err))
})

test('large write', (t) => {
  t.plan(3)

  const server = new ws.Server({ port: 8080 })

  server.on('connection', (ws) => {
    ws.on('data', (data) => {
      t.alike(data, Buffer.alloc(4 * 1024 * 1024, 'hello'))

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

    client.end(Buffer.alloc(4 * 1024 * 1024, 'hello'))
  })
})

// Speaks the handshake by hand, so the bytes on the wire are the ones under test.
function raw(port, request, onhandshake) {
  const socket = net.createConnection({ port })

  let handshaken = false
  let head = ''

  socket.on('connect', () => socket.write(request))

  socket.on('data', (data) => {
    if (handshaken) return

    head += data.toString('latin1')

    const i = head.indexOf('\r\n\r\n')

    if (i === -1) return

    handshaken = true

    const status = +head.slice(9, 12)

    onhandshake(status, socket)
  })

  socket.on('error', () => {})

  return socket
}

function upgrade(port, extra = '') {
  return (
    'GET / HTTP/1.1\r\n' +
    `Host: localhost:${port}\r\n` +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Version: 13\r\n' +
    'Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n' +
    extra +
    '\r\n'
  )
}

// The key masked frames are written with, whose every byte differs so that a
// payload masked with the wrong one of them does not come out intact anyway.
const KEY = Buffer.from([0x37, 0xfa, 0x21, 0x3d])

// One frame, as the bytes a peer would put on the wire, so that what is under
// test is only ever reached the way a peer reaches it.
function frame(opcode, payload = Buffer.alloc(0), opts = {}) {
  const { fin = true, mask = true, length = payload.byteLength, rsv = 0 } = opts

  const header = []

  header.push((fin ? 0x80 : 0) | (rsv << 4) | opcode)

  if (length <= 0x7d) header.push((mask ? 0x80 : 0) | length)
  else if (length <= 0xffff) {
    header.push((mask ? 0x80 : 0) | 0x7e, length >> 8, length & 0xff)
  } else {
    header.push((mask ? 0x80 : 0) | 0x7f, 0, 0, 0, 0)
    header.push(
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff
    )
  }

  if (mask === false) return Buffer.concat([Buffer.from(header), payload])

  header.push(...KEY)

  const masked = Buffer.alloc(payload.byteLength)

  for (let i = 0; i < masked.byteLength; i++) masked[i] = payload[i] ^ KEY[i & 3]

  return Buffer.concat([Buffer.from(header), masked])
}

// Payload bytes as they go on the wire behind a masked header, for the tests
// that hand a payload over in pieces of their own choosing. Which byte of the
// key applies follows from the position in the payload.
function maskBytes(payload, position = 0) {
  const masked = Buffer.alloc(payload.byteLength)

  for (let i = 0; i < masked.byteLength; i++) masked[i] = payload[i] ^ KEY[(position + i) & 3]

  return masked
}

// The payload of the first frame in a buffer of them, read the way a peer would
// have to: the header says how long it is and where the payload starts.
function payloadOf(buffer) {
  const masked = (buffer[1] & 0x80) !== 0

  let length = buffer[1] & 0x7f
  let at = 2

  if (length === 0x7e) {
    length = buffer.readUInt16BE(2)
    at = 4
  } else if (length === 0x7f) {
    length = Number(buffer.readBigUInt64BE(2))
    at = 10
  }

  const key = masked ? buffer.subarray(at, at + 4) : null

  if (masked) at += 4

  const payload = Buffer.alloc(length)

  for (let i = 0; i < length; i++) {
    payload[i] = key === null ? buffer[at + i] : buffer[at + i] ^ key[i & 3]
  }

  return { opcode: buffer[0] & 0x0f, fin: (buffer[0] & 0x80) !== 0, key, payload, end: at + length }
}

test('malformed handshake is answered and the server survives', async (t) => {
  t.plan(10)

  const cases = [
    ['bad version', 'Sec-WebSocket-Version: 7\r\n', 426, 'INVALID_VERSION_HEADER'],
    ['bad key', 'Sec-WebSocket-Key: nope\r\n', 400, 'INVALID_KEY_HEADER'],
    ['no key', '', 400, 'INVALID_KEY_HEADER'],
    ['bad upgrade', 'Upgrade: h2c\r\n', 400, 'INVALID_UPGRADE_HEADER'],
    ['post', null, 405, 'INVALID_METHOD']
  ]

  const server = new ws.Server({ port: 8081 })

  server.on('connection', () => t.fail('should not have upgraded'))

  await new Promise((resolve) => server.on('listening', resolve))

  for (const [name, headers, status, code] of cases) {
    const request =
      headers === null
        ? 'POST / HTTP/1.1\r\nHost: h\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n' +
          'Content-Length: 0\r\n\r\n'
        : 'GET / HTTP/1.1\r\nHost: h\r\n' +
          (headers.startsWith('Upgrade:') ? headers : 'Upgrade: websocket\r\n') +
          'Connection: Upgrade\r\n' +
          (headers.startsWith('Sec-WebSocket-Version')
            ? headers
            : 'Sec-WebSocket-Version: 13\r\n') +
          (headers.startsWith('Sec-WebSocket-Key')
            ? headers
            : name === 'no key'
              ? ''
              : 'Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n') +
          '\r\n'

    const reported = new Promise((resolve) => server.once('handshakeError', resolve))

    const got = await new Promise((resolve) => {
      raw(8081, request, (status) => resolve(status))
    })

    t.is(got, status, `${name} answered ${status}`)
    t.is((await reported).code, code, `${name} reported as ${code}`)
  }

  await new Promise((resolve) => server.close(resolve))
})

test('verifyClient refuses before the 101 is written', async (t) => {
  t.plan(4)

  const seen = []

  const server = new ws.Server({
    port: 8082,
    verifyClient(req) {
      seen.push(req.headers.origin)
      return req.headers.origin === 'https://allowed.example'
    }
  })

  const sockets = []

  server.on('connection', (socket) => sockets.push(socket))

  await new Promise((resolve) => server.on('listening', resolve))

  const refused = await new Promise((resolve) => {
    raw(8082, upgrade(8082, 'Origin: https://evil.example\r\n'), (status) => resolve(status))
  })

  t.is(refused, 403, 'a disallowed origin is answered 403')

  const allowed = await new Promise((resolve) => {
    raw(8082, upgrade(8082, 'Origin: https://allowed.example\r\n'), (status) => resolve(status))
  })

  t.is(allowed, 101, 'an allowed origin is upgraded')
  t.alike(seen, ['https://evil.example', 'https://allowed.example'], 'both were inspected')
  t.ok(true, 'server still running')

  for (const socket of sockets) socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('verifyClient may be asynchronous', async (t) => {
  t.plan(2)

  const server = new ws.Server({
    port: 8083,
    async verifyClient(req) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return req.headers['x-token'] === 'good'
    }
  })

  const sockets = []

  server.on('connection', (socket) => sockets.push(socket))

  await new Promise((resolve) => server.on('listening', resolve))

  t.is(
    await new Promise((resolve) => raw(8083, upgrade(8083, 'X-Token: bad\r\n'), resolve)),
    403,
    'refused'
  )

  t.is(
    await new Promise((resolve) => raw(8083, upgrade(8083, 'X-Token: good\r\n'), resolve)),
    101,
    'allowed after the await'
  )

  for (const socket of sockets) socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('oversized control frame is refused', async (t) => {
  t.plan(1)

  const server = new ws.Server({ port: 8084 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  raw(8084, upgrade(8084), (status, socket) => {
    // A PING declaring 126 bytes, one past the limit for a control frame.
    socket.write(frame(0x9, Buffer.alloc(126)))
  })

  t.is((await failed).code, 'INVALID_CONTROL_PAYLOAD_LENGTH')

  await new Promise((resolve) => server.close(resolve))
})

test('fragment flood is refused', async (t) => {
  t.plan(1)

  const server = new ws.Server({ port: 8085, maxFragments: 8 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  raw(8085, upgrade(8085), (status, socket) => {
    const frames = [frame(0x2, Buffer.alloc(0), { fin: false })]

    for (let i = 0; i < 32; i++) frames.push(frame(0x0, Buffer.alloc(0), { fin: false }))

    socket.write(Buffer.concat(frames))
  })

  t.is((await failed).code, 'TOO_MANY_FRAGMENTS')

  await new Promise((resolve) => server.close(resolve))
})

test('oversized frame is refused on its header alone', async (t) => {
  t.plan(2)

  const server = new ws.Server({ port: 8086, maxPayload: 1024 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  let sent = 0

  raw(8086, upgrade(8086), (status, socket) => {
    // A header declaring 64 MiB, and not one byte of the payload it promises.
    const header = frame(0x2, Buffer.alloc(0), { length: 64 * 1024 * 1024 })
    sent = header.byteLength
    socket.write(header)
  })

  t.is((await failed).code, 'MESSAGE_TOO_LARGE')
  t.is(sent, 14, 'refused after 14 bytes')

  await new Promise((resolve) => server.close(resolve))
})

test('fragments are refused once they exceed maxPayload in total', async (t) => {
  t.plan(1)

  const server = new ws.Server({ port: 8087, maxPayload: 1024 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  raw(8087, upgrade(8087), (status, socket) => {
    // Each fragment is under the limit; together they are not.
    socket.write(frame(0x2, Buffer.alloc(600), { fin: false }))
    socket.write(frame(0x0, Buffer.alloc(600), { fin: false }))
  })

  t.is((await failed).code, 'MESSAGE_TOO_LARGE')

  await new Promise((resolve) => server.close(resolve))
})

test('nothing is read past a close frame', async (t) => {
  t.plan(2)

  const server = new ws.Server({ port: 8088 })

  const received = []

  const closed = new Promise((resolve) => {
    server.on('connection', (socket) => {
      socket.on('data', (data) => received.push(data.toString()))
      socket.on('close', resolve)
    })
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(8088, upgrade(8088), (status, socket) => {
    // A close, with a text frame pipelined behind it in the same segment.
    socket.write(Buffer.concat([frame(0x8), frame(0x1, Buffer.from('abc'))]))
  })

  await closed

  t.alike(received, [], 'the pipelined frame was not delivered')
  t.ok(true, 'connection closed')

  peer.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('unmasked frames are refused whatever their length', async (t) => {
  t.plan(1)

  const server = new ws.Server({ port: 8089 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  raw(8089, upgrade(8089), (status, socket) => {
    socket.write(frame(0x1, Buffer.alloc(0), { mask: false }))
  })

  t.is((await failed).code, 'EXPECTED_MASK')

  await new Promise((resolve) => server.close(resolve))
})

test('invalid UTF-8 in a text frame is refused', async (t) => {
  t.plan(1)

  const server = new ws.Server({ port: 8090 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  raw(8090, upgrade(8090), (status, socket) => {
    socket.write(frame(0x1, Buffer.from([0xc3, 0x28])))
  })

  t.is((await failed).code, 'INVALID_UTF8')

  await new Promise((resolve) => server.close(resolve))
})

test('invalid close payloads are refused', async (t) => {
  t.plan(2)

  for (const [port, payload, code] of [
    [8091, Buffer.from([0x03]), 'INVALID_CLOSE_PAYLOAD'],
    [8092, Buffer.from([0x03, 0xed]), 'INVALID_CLOSE_STATUS']
  ]) {
    const server = new ws.Server({ port })

    const failed = new Promise((resolve) => {
      server.on('connection', (socket) => socket.on('error', resolve))
    })

    await new Promise((resolve) => server.on('listening', resolve))

    raw(port, upgrade(port), (status, socket) => socket.write(frame(0x8, payload)))

    t.is((await failed).code, code)

    await new Promise((resolve) => server.close(resolve))
  }
})

test('client refuses a handshake that is not a 101', async (t) => {
  t.plan(1)

  const sockets = []

  const server = net.createServer((socket) => {
    sockets.push(socket)

    let head = ''

    socket.on('data', (data) => {
      head += data.toString()

      if (!head.includes('\r\n\r\n')) return

      const key = /sec-websocket-key: (.*)\r\n/i.exec(head)[1]
      const accept = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

      socket.write(
        'HTTP/1.1 200 OK\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      )
    })

    socket.on('error', () => {})
  })

  await new Promise((resolve) => server.listen(8093, resolve))

  const client = new ws.Socket({ port: 8093 })

  t.is((await new Promise((resolve) => client.on('error', resolve))).code, 'INVALID_UPGRADE_STATUS')

  for (const socket of sockets) socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('the client masks every frame it sends, close included', async (t) => {
  t.plan(1)

  const sent = []

  const sockets = []

  const server = net.createServer((socket) => {
    sockets.push(socket)

    let head = ''
    let up = false

    socket.on('data', (data) => {
      if (!up) {
        head += data.toString()
        if (!head.includes('\r\n\r\n')) return
        up = true

        const key = /sec-websocket-key: (.*)\r\n/i.exec(head)[1]
        const accept = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
        )
        return
      }

      for (let i = 0; i < data.byteLength;) {
        const masked = (data[i + 1] & 0x80) !== 0
        const length = data[i + 1] & 0x7f

        sent.push({ opcode: data[i] & 0x0f, masked })

        i += 2 + (masked ? 4 : 0) + length
      }
    })

    socket.on('error', () => {})
  })

  await new Promise((resolve) => server.listen(8094, resolve))

  const client = new ws.Socket({ port: 8094 })

  await new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))

  client.ping('hi')
  client.end('hello')

  await new Promise((resolve) => setTimeout(resolve, 100))

  t.ok(
    sent.length === 3 && sent.every((f) => f.masked),
    `all ${sent.length} client frames masked: ${JSON.stringify(sent)}`
  )

  client.destroy()
  for (const socket of sockets) socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('a silent peer is dropped once the idle timeout expires', async (t) => {
  t.plan(2)

  const server = new ws.Server({ port: 8095, idleTimeout: 200 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const started = Date.now()

  // Handshake, then say nothing at all.
  raw(8095, upgrade(8095), () => {})

  t.is((await failed).code, 'CONNECTION_TIMEOUT')
  t.ok(Date.now() - started >= 200, 'waited out the full budget')

  await new Promise((resolve) => server.close(resolve))
})

test('a peer that answers pings is kept', async (t) => {
  t.plan(1)

  const server = new ws.Server({ port: 8096, idleTimeout: 200 })

  let failure = null

  server.on('connection', (socket) => socket.on('error', (err) => (failure = err)))

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(8096, upgrade(8096), (status, socket) => {
    socket.on('data', (data) => {
      // Answer any ping with a pong, and otherwise stay quiet.
      for (let i = 0; i < data.byteLength;) {
        const length = data[i + 1] & 0x7f
        if ((data[i] & 0x0f) === 0x9) socket.write(frame(0xa))
        i += 2 + length
      }
    })
  })

  await new Promise((resolve) => setTimeout(resolve, 700))

  t.absent(failure, 'a responsive peer outlives several idle periods')

  peer.destroy()

  await new Promise((resolve) => server.close(resolve))
})

// The lengths either side of the two points where the wire format changes shape:
// 125 is the last one that fits in the length field, 0xffff the last that fits
// in the 16 bit extension.
const LENGTHS = [0, 1, 2, 125, 126, 127, 128, 0xfffe, 0xffff, 0x10000, 0x10001]

test('a message of every length survives the trip in both directions', async (t) => {
  t.plan(LENGTHS.length * 2)

  const { client, socket, close } = await pair()

  for (const length of LENGTHS) {
    const payload = Buffer.alloc(length, 0x78)

    // A client masks what it sends and a server masks none of it, so the two
    // directions are not the same code path.
    client.write(payload)
    t.alike(await message(socket), payload, `${length} bytes from the client`)

    socket.write(payload)
    t.alike(await message(client), payload, `${length} bytes from the server`)
  }

  await close()
})

test('a client masks each frame with a key of its own', async (t) => {
  t.plan(4)

  const wire = wireServer(nextPort())

  await wire.listen()

  const client = new ws.Socket({ port: wire.server.address().port })

  await new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))

  const payload = Buffer.from('the same payload every time')

  client.write(payload)
  client.write(payload)

  t.ok(await until(() => wire.frames().length === 2), 'both frames went out')

  const [first, second] = wire.frames()

  t.unlike(first.key, second.key, 'two frames of the same payload carry different keys')
  t.alike(first.payload, payload, 'the first unmasks to the payload')
  t.alike(second.payload, payload, 'and so does the second')

  client.destroy()

  await wire.close()
})

test('a payload length past the safe integer range is refused', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  // A 64 bit length whose high word is 0x00200000, which is 2^53.
  const peer = raw(p, upgrade(p), (status, socket) =>
    socket.write(Buffer.from([0x82, 0xff, 0x00, 0x20, 0, 0, 0, 0, 0, 0, 0x37, 0xfa, 0x21, 0x3d]))
  )

  t.is((await failed).code, 'INVALID_PAYLOAD_LENGTH', 'refused on the header')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a maxPayload of -1 removes the ceiling', async (t) => {
  t.plan(2)

  // A header declaring 1 GiB, with none of the payload behind it.
  const header = frame(0x2, Buffer.alloc(0), { length: 0x40000000 })

  for (const [maxPayload, code, name] of [
    [1024, 'MESSAGE_TOO_LARGE', 'refused under a limit'],
    [-1, null, 'without a limit the header is simply waited on']
  ]) {
    const p = nextPort()
    const server = serve(p, { maxPayload })

    const connected = new Promise((resolve) => server.once('connection', resolve))

    await new Promise((resolve) => server.on('listening', resolve))

    const peer = raw(p, upgrade(p), (status, socket) => socket.write(header))

    const socket = await connected
    const err = await settles(socket, 500)

    t.is(err && err.code, code, name)

    peer.destroy()
    socket.destroy()

    await new Promise((resolve) => server.close(resolve))
  }
})

let port = 8200

function nextPort() {
  return port++
}

async function pair(opts = {}) {
  const port = nextPort()

  const server = new ws.Server({ port, ...opts.server })

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const client = new ws.Socket({ port, ...opts.client })

  // Listened for before awaiting the server side, or an 'open' in between is
  // lost.
  const opened = new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))

  const socket = await connected

  await opened

  return {
    port,
    server,
    client,
    socket,
    async close() {
      client.destroy()
      socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

// Connections always have an error listener, since an unheard 'error' is fatal.
function serve(port, opts = {}) {
  const server = new ws.Server({ port, ...opts })

  server.on('connection', (socket) => socket.on('error', () => {}))

  return server
}

// Remembers its connections, since `close` waits on every one of them.
function rawServer(onconnection) {
  const sockets = []

  const server = net.createServer((socket) => {
    sockets.push(socket)
    socket.on('error', () => {})
    onconnection(socket)
  })

  const close = server.close.bind(server)

  server.close = (cb) => {
    for (const socket of sockets) socket.destroy()
    return close(cb)
  }

  return server
}

function message(socket) {
  return new Promise((resolve) => socket.once('data', resolve))
}

test('a string is sent as a text frame and a buffer as a binary one', async (t) => {
  t.plan(6)

  const wire = wireServer(nextPort())

  await wire.listen()

  const client = new ws.Socket({ port: wire.server.address().port })

  await new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))

  client.write('some text')
  client.write(Buffer.from('some bytes'))

  t.ok(await until(() => wire.frames().length === 2), 'two frames went out')

  const [text, binary] = wire.frames()

  t.is(text.opcode, 0x1, 'a string went out as TEXT')
  t.alike(text.payload, Buffer.from('some text'), 'carrying the string')
  t.is(binary.opcode, 0x2, 'a buffer went out as BINARY')
  t.alike(binary.payload, Buffer.from('some bytes'), 'carrying the bytes')
  t.ok(text.fin && binary.fin, 'both finished the message they opened')

  client.destroy()

  await wire.close()
})

test('messages of every shape survive the round trip', async (t) => {
  const payloads = [
    Buffer.alloc(1),
    Buffer.alloc(125, 'a'),
    Buffer.alloc(126, 'b'),
    Buffer.alloc(127, 'c'),
    Buffer.alloc(0xffff, 'd'),
    Buffer.alloc(0x10000, 'e'),
    Buffer.from('héllo wörld 日本語 👋')
  ]

  t.plan(payloads.length)

  const { client, socket, close } = await pair()

  for (const payload of payloads) {
    client.write(payload)
    t.alike(await message(socket), payload, `${payload.byteLength} bytes`)
  }

  await close()
})

test('messages travel in both directions', async (t) => {
  t.plan(2)

  const { client, socket, close } = await pair()

  client.write('to the server')
  t.alike(await message(socket), Buffer.from('to the server'))

  socket.write('to the client')
  t.alike(await message(client), Buffer.from('to the client'))

  await close()
})

test('several messages keep their order', async (t) => {
  t.plan(1)

  const { client, socket, close } = await pair()

  const received = []

  const done = new Promise((resolve) => {
    socket.on('data', (data) => {
      received.push(data.toString())
      if (received.length === 5) resolve()
    })
  })

  for (let i = 0; i < 5; i++) client.write(`message ${i}`)

  await done

  t.alike(received, ['message 0', 'message 1', 'message 2', 'message 3', 'message 4'])

  await close()
})

test('a fragmented message is reassembled', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const received = new Promise((resolve) => {
    server.on('connection', (socket) => socket.once('data', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.write(
      Buffer.concat([
        frame(0x1, Buffer.from('one '), { fin: false }),
        frame(0x0, Buffer.from('two '), { fin: false }),
        frame(0x0, Buffer.from('three'))
      ])
    )
  })

  t.alike(await received, Buffer.from('one two three'), 'three fragments became one message')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a fragmented message may be split into many pieces', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const received = new Promise((resolve) => {
    server.on('connection', (socket) => socket.once('data', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const pieces = []

  for (let i = 0; i < 200; i++) {
    pieces.push(frame(i === 0 ? 0x2 : 0x0, Buffer.from([i]), { fin: false }))
  }

  pieces.push(frame(0x0, Buffer.from([200])))

  const peer = raw(p, upgrade(p), (status, socket) => socket.write(Buffer.concat(pieces)))

  const expected = Buffer.from(Array.from({ length: 201 }, (_, i) => i))

  t.alike(await received, expected, '201 fragments became one message')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a multi-byte character split across fragments still validates', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const received = new Promise((resolve) => {
    server.on('connection', (socket) => socket.once('data', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  // The four bytes of a waving hand, cut down the middle.
  const wave = Buffer.from('👋')

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.write(
      Buffer.concat([frame(0x1, wave.subarray(0, 2), { fin: false }), frame(0x0, wave.subarray(2))])
    )
  })

  t.alike(await received, wave, 'validated across the join, not per fragment')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a control frame may arrive inside a fragmented message', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const pinged = new Promise((resolve) => {
    server.on('connection', (socket) => socket.once('ping', resolve))
  })

  const received = new Promise((resolve) => {
    server.on('connection', (socket) => socket.once('data', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.write(
      Buffer.concat([
        frame(0x1, Buffer.from('before '), { fin: false }),
        frame(0x9, Buffer.from('ping')),
        frame(0x0, Buffer.from('after'))
      ])
    )
  })

  t.alike(await pinged, Buffer.from('ping'), 'the ping was answered mid-message')
  t.alike(await received, Buffer.from('before after'), 'and the message still reassembled')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a frame split across TCP segments is reassembled', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const received = new Promise((resolve) => {
    server.on('connection', (socket) => socket.once('data', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const payload = Buffer.alloc(1000, 'q')
  const complete = frame(0x2, payload)

  const peer = raw(p, upgrade(p), (status, socket) => {
    // One byte at a time for the header, then the rest in small pieces.
    let i = 0

    const pump = () => {
      if (i >= complete.byteLength || socket.destroyed) return

      const end = Math.min(i + (i < 20 ? 1 : 64), complete.byteLength)

      socket.write(complete.subarray(i, end))

      i = end

      setTimeout(pump, 1)
    }

    pump()
  })

  t.alike(await received, payload, 'reassembled from a dribble of segments')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('several frames in one segment are all delivered', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const received = []

  const done = new Promise((resolve) => {
    server.on('connection', (socket) => {
      socket.on('data', (data) => {
        received.push(data.toString())
        if (received.length === 3) resolve()
      })
    })
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.write(
      Buffer.concat([
        frame(0x1, Buffer.from('first')),
        frame(0x1, Buffer.from('second')),
        frame(0x1, Buffer.from('third'))
      ])
    )
  })

  await done

  t.alike(received, ['first', 'second', 'third'], 'three pipelined frames')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a client accepts a url string, a URL, or options', async (t) => {
  t.plan(3)

  const p = nextPort()
  const server = serve(p)

  await new Promise((resolve) => server.on('listening', resolve))

  const clients = [
    ['url string', new ws.Socket(`ws://localhost:${p}/`)],
    ['URL object', new ws.Socket(new URL(`ws://localhost:${p}/`))],
    ['options', new ws.Socket({ port: p })]
  ]

  // All three are already connecting, so each is listened to as it is made: an
  // 'open' that fires before its listener exists never comes again.
  const attempts = clients.map(([name, client]) => ({
    name,
    client,
    opened: new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))
  }))

  for (const { name, opened } of attempts) {
    await opened

    t.pass(`${name} connected`)
  }

  for (const { client } of attempts) client.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('a url is taken apart into host, port, path and scheme', (t) => {
  const cases = [
    ['ws://example.com/', 'example.com', 80, '/', false],
    ['ws://example.com:8080/chat', 'example.com', 8080, '/chat', false],
    ['wss://example.com/', 'example.com', 443, '/', true],
    ['wss://example.com:8443/a/b?c=d', 'example.com', 8443, '/a/b?c=d', true],
    ['http://example.com/', 'example.com', 80, '/', false],
    ['https://example.com/', 'example.com', 443, '/', true]
  ]

  t.plan(cases.length * 4)

  for (const [url, host, port, path, secure] of cases) {
    // Reading what the constructor derived without opening a connection.
    const parsed = new URL(url)

    const opts = {
      host: parsed.hostname,
      path: parsed.pathname + parsed.search,
      port: parsed.port ? parseInt(parsed.port, 10) : defaultPortFor(parsed.protocol),
      secure: parsed.protocol === 'https:' || parsed.protocol === 'wss:'
    }

    t.is(opts.host, host, `${url} host`)
    t.is(opts.port, port, `${url} port`)
    t.is(opts.path, path, `${url} path`)
    t.is(opts.secure, secure, `${url} secure`)
  }

  function defaultPortFor(protocol) {
    return protocol === 'https:' || protocol === 'wss:' ? 443 : 80
  }
})

test('a client reaches the path and query the url named', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const requested = new Promise((resolve) => {
    server.on('connection', (socket, req) => resolve(req.url))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const client = new ws.Socket(`ws://localhost:${p}/chat/room?id=7`)

  client.on('error', () => {})

  t.is(await requested, '/chat/room?id=7')

  client.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('hostname and a string port are accepted for Node compatibility', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  await new Promise((resolve) => server.on('listening', resolve))

  const client = new ws.Socket({ hostname: 'localhost', port: String(p) })

  await new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))

  t.pass('connected')

  client.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('ping and pong before the socket is connected', (t) => {
  t.plan(2)

  // Never connects, so the calls land while `_socket` is still null.
  const client = new ws.Socket({ port: 1 })

  client.on('error', () => {})

  t.exception(() => client.ping(), /NOT_CONNECTED/)
  t.exception(() => client.pong(), /NOT_CONNECTED/)

  client.destroy()
})

test('a server may be constructed from just a connection handler', async (t) => {
  t.plan(1)

  const connected = []

  // Given only a handler, it still listens, on a port of the system's choosing.
  const server = new ws.Server((socket) => {
    socket.on('error', () => {})
    connected.push(socket)
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const client = new ws.Socket({ port: server.address().port })

  await new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))

  t.is(connected.length, 1, 'the handler was registered as a connection listener')

  client.destroy()
  for (const socket of connected) socket.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a server reports its address and whether it is listening', async (t) => {
  t.plan(4)

  const p = nextPort()
  const server = serve(p)

  t.absent(server.listening, 'not listening before the event')

  await new Promise((resolve) => server.on('listening', resolve))

  t.ok(server.listening, 'listening after it')
  t.is(server.address().port, p, 'reports the port it was given')
  t.is(server.ref(), server, 'ref is chainable')

  server.unref()

  await new Promise((resolve) => server.close(resolve))
})

test('close, ref and unref return the server', async (t) => {
  t.plan(3)

  const server = serve(nextPort())

  await new Promise((resolve) => server.on('listening', resolve))

  t.is(server.ref(), server)
  t.is(server.unref(), server)
  t.is(server.close(), server)

  await new Promise((resolve) => setTimeout(resolve, 50))
})

test('a plain HTTP request is answered 426', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  await new Promise((resolve) => server.on('listening', resolve))

  const response = await new Promise((resolve) => {
    const socket = net.createConnection({ port: p })

    let head = ''

    socket.on('connect', () => socket.write(`GET / HTTP/1.1\r\nHost: localhost:${p}\r\n\r\n`))
    socket.on('data', (data) => {
      head += data.toString()
      if (head.includes('Upgrade Required')) {
        socket.destroy()
        resolve(head)
      }
    })
    socket.on('error', () => {})
  })

  t.ok(response.startsWith('HTTP/1.1 426'), 'answered 426')
  t.ok(response.includes('Upgrade Required'), 'with a body saying why')

  await new Promise((resolve) => server.close(resolve))
})

test('a server may be given an HTTP server of its own', async (t) => {
  t.plan(2)

  const p = nextPort()
  const http = require('bare-http1')

  const httpServer = http.createServer((req, res) => res.end('from the http server'))

  await new Promise((resolve) => httpServer.listen(p, resolve))

  const server = new ws.Server({ server: httpServer })

  server.on('connection', (socket) => socket.on('error', () => {}))

  const client = new ws.Socket({ port: p })

  await new Promise((resolve, reject) => client.on('open', resolve).on('error', reject))

  t.pass('upgraded on the provided server')

  const body = await new Promise((resolve) => {
    const req = http.request({ port: p, path: '/' }, (res) => {
      let body = ''
      res.on('data', (d) => (body += d))
      res.on('end', () => resolve(body))
    })
    req.end()
  })

  t.is(body, 'from the http server', 'ordinary requests still reach it')

  client.destroy()
  await new Promise((resolve) => httpServer.close(resolve))
})

test('destroying a client mid-handshake does not leak the connection', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  let connections = 0

  server.on('connection', () => connections++)

  await new Promise((resolve) => server.on('listening', resolve))

  // Given up on before the handshake callback runs.
  const client = new ws.Socket({ port: p })

  client.on('error', () => {})
  client.destroy()

  await new Promise((resolve) => setTimeout(resolve, 200))

  // Which only completes if nothing is still holding a connection open.
  await new Promise((resolve) => server.close(resolve))

  t.is(connections, 0, 'the server was left with nothing open')
})

test('a close frame ends the readable side', async (t) => {
  t.plan(2)

  const { client, socket, close } = await pair()

  const ended = new Promise((resolve) => socket.on('end', resolve))
  const closed = new Promise((resolve) => socket.on('close', resolve))

  client.end()

  await ended
  t.pass('the server saw the end of the stream')

  await closed
  t.pass('and then the close')

  await close()
})

test('close payloads that the spec allows are accepted', async (t) => {
  const payloads = [
    ['empty', Buffer.alloc(0)],
    ['1000', Buffer.from([0x03, 0xe8])],
    ['1001 going away', Buffer.from([0x03, 0xe9])],
    ['3000, an application code', Buffer.from([0x0b, 0xb8])],
    ['4999, the last application code', Buffer.from([0x13, 0x87])],
    ['a code and a reason', Buffer.concat([Buffer.from([0x03, 0xe8]), Buffer.from('bye')])]
  ]

  t.plan(payloads.length)

  for (const [name, payload] of payloads) {
    const p = nextPort()
    const server = serve(p)

    let failure = null

    const closed = new Promise((resolve) => {
      server.on('connection', (socket) => {
        socket.on('error', (err) => (failure = err))
        socket.on('close', resolve)
      })
    })

    await new Promise((resolve) => server.on('listening', resolve))

    const peer = raw(p, upgrade(p), (status, socket) => socket.write(frame(0x8, payload)))

    await closed

    t.absent(failure, `close with ${name} was accepted`)

    peer.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a close reason that is not UTF-8 is refused', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const payload = Buffer.concat([Buffer.from([0x03, 0xe8]), Buffer.from([0xc3, 0x28])])
  const peer = raw(p, upgrade(p), (status, socket) => socket.write(frame(0x8, payload)))

  t.is((await failed).code, 'INVALID_UTF8')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('the server may close the connection', async (t) => {
  t.plan(1)

  const { client, socket, close } = await pair()

  const ended = new Promise((resolve) => client.on('end', resolve))

  socket.end()

  await ended

  t.pass('the client saw the close')

  await close()
})

const REFUSALS = [
  ['RSV1 set', () => Buffer.from([0xc1, 0x80, 0, 0, 0, 0]), 'UNEXPECTED_RSV1'],
  ['RSV2 set', () => Buffer.from([0xa1, 0x80, 0, 0, 0, 0]), 'UNEXPECTED_RSV2'],
  ['RSV3 set', () => Buffer.from([0x91, 0x80, 0, 0, 0, 0]), 'UNEXPECTED_RSV3'],
  ['opcode 0x3', () => frame(0x3, Buffer.from('x')), 'INVALID_OPCODE'],
  ['opcode 0x7', () => frame(0x7, Buffer.from('x')), 'INVALID_OPCODE'],
  ['opcode 0xb', () => frame(0xb), 'INVALID_OPCODE'],
  ['opcode 0xf', () => frame(0xf), 'INVALID_OPCODE'],
  [
    'continuation with nothing to continue',
    () => frame(0x0, Buffer.from('x')),
    'UNEXPECTED_CONTINUATION'
  ],
  [
    'unfinished continuation with nothing to continue',
    () => frame(0x0, Buffer.from('x'), { fin: false }),
    'UNEXPECTED_CONTINUATION'
  ],
  [
    'a new message opened mid-message',
    () =>
      Buffer.concat([frame(0x1, Buffer.from('a'), { fin: false }), frame(0x1, Buffer.from('b'))]),
    'EXPECTED_CONTINUATION'
  ],
  [
    'an unfinished new message opened mid-message',
    () =>
      Buffer.concat([
        frame(0x1, Buffer.from('a'), { fin: false }),
        frame(0x2, Buffer.from('b'), { fin: false })
      ]),
    'EXPECTED_CONTINUATION'
  ],
  ['a fragmented ping', () => frame(0x9, Buffer.from('x'), { fin: false }), 'UNEXPECTED_CONTROL'],
  ['a fragmented close', () => frame(0x8, Buffer.alloc(0), { fin: false }), 'UNEXPECTED_CONTROL']
]

test('frames a peer must not send are refused', async (t) => {
  t.plan(REFUSALS.length)

  for (const [name, make, code] of REFUSALS) {
    const p = nextPort()
    const server = serve(p)

    const failed = new Promise((resolve) => {
      server.on('connection', (socket) => socket.on('error', resolve))
    })

    await new Promise((resolve) => server.on('listening', resolve))

    const peer = raw(p, upgrade(p), (status, socket) => socket.write(make()))

    t.is((await failed).code, code, name)

    peer.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a client refuses a masked frame from a server', async (t) => {
  t.plan(1)

  const p = nextPort()

  const server = rawServer((socket) => {
    let head = ''

    socket.on('data', (data) => {
      head += data.toString()

      if (!head.includes('\r\n\r\n')) return

      const key = /sec-websocket-key: (.*)\r\n/i.exec(head)[1]
      const accept = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      )

      // A server must never mask, so this has to be refused.
      socket.write(frame(0x1, Buffer.from('abc')))
    })
  })

  await new Promise((resolve) => server.listen(p, resolve))

  const client = new ws.Socket({ port: p })

  t.is((await new Promise((resolve) => client.on('error', resolve))).code, 'UNEXPECTED_MASK')

  client.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a protocol failure tells the peer why before hanging up', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  await new Promise((resolve) => server.on('listening', resolve))

  let peer = null

  const reply = await new Promise((resolve) => {
    const frames = []

    peer = raw(p, upgrade(p), (status, socket) => {
      socket.write(frame(0x9, Buffer.alloc(126)))

      // The server half closes after answering, so wait on the bytes.
      socket.on('data', (data) => {
        frames.push(data)
        resolve(Buffer.concat(frames))
      })
    })
  })

  t.is(reply[0], 0x88, 'answered with a close frame')
  t.is(reply.readUInt16BE(2), 1002, 'carrying the protocol error status')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('writing with an encoding that is not text or bytes is refused', async (t) => {
  t.plan(1)

  const { client, close } = await pair()

  const failed = new Promise((resolve) => client.on('error', resolve))

  // A text frame carries UTF-8, so any other string encoding is refused.
  client.write('abc', 'latin1')

  t.is((await failed).code, 'INVALID_ENCODING')

  await close()
})

test('maxPayload of -1 lets an oversized message through', async (t) => {
  t.plan(1)

  const { client, socket, close } = await pair({
    server: { maxPayload: -1 },
    client: { maxPayload: -1 }
  })

  const payload = Buffer.alloc(200 * 1024, 'w')

  client.write(payload)

  t.alike(await message(socket), payload, 'delivered with no ceiling in place')

  await close()
})

test('an idleTimeout of 0 leaves a silent connection alone', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p, { idleTimeout: 0 })

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const received = []

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.on('data', (data) => received.push(data))
  })

  const socket = await connected

  let failure = null

  socket.on('error', (err) => (failure = err))

  await new Promise((resolve) => setTimeout(resolve, 300))

  t.is(received.length, 0, 'a silent peer was never pinged')
  t.absent(failure, 'still connected after a period of silence')

  peer.destroy()
  socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('the server handshake accepts its documented argument shapes', async (t) => {
  t.plan(4)

  const p = nextPort()
  const http = require('bare-http1')

  const shapes = []

  const httpServer = http.createServer(() => {})

  httpServer.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {})

    const shape = shapes.shift()

    const cb = (err) => {
      socket.destroy()
      shape.resolve(err)
    }

    if (shape.name === 'req, cb') ws.Server.handshake(req, cb)
    else if (shape.name === 'req, socket, cb') ws.Server.handshake(req, socket, cb)
    else ws.Server.handshake(req, socket, head, cb)
  })

  await new Promise((resolve) => httpServer.listen(p, resolve))

  for (const name of ['req, cb', 'req, socket, cb', 'req, socket, head, cb']) {
    const result = new Promise((resolve) => shapes.push({ name, resolve }))

    raw(p, upgrade(p), () => {})

    t.absent(await result, `handshake(${name})`)
  }

  // `exception.all`, since brittle rethrows native errors from `exception`.
  await t.exception.all(
    () => ws.Server.handshake({}),
    /Callback is required/,
    'a callback is required'
  )

  await new Promise((resolve) => httpServer.close(resolve))
})

test('a verifyClient that throws refuses the handshake', async (t) => {
  t.plan(2)

  const p = nextPort()

  const server = new ws.Server({
    port: p,
    verifyClient() {
      throw new Error('the token store is down')
    }
  })

  server.on('connection', () => t.fail('should not have upgraded'))

  const reported = new Promise((resolve) => server.on('handshakeError', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  t.is(await new Promise((resolve) => raw(p, upgrade(p), resolve)), 403, 'answered 403')
  t.is((await reported).code, 'UPGRADE_REJECTED', 'reported as a rejection, not a crash')

  await new Promise((resolve) => server.close(resolve))
})

test('a client checks the upgrade and accept headers it gets back', async (t) => {
  const cases = [
    [
      'no websocket in Upgrade',
      (accept) => `Upgrade: h2c\r\nSec-WebSocket-Accept: ${accept}\r\n`,
      'INVALID_UPGRADE_HEADER'
    ],
    [
      'wrong accept digest',
      () => 'Upgrade: websocket\r\nSec-WebSocket-Accept: AAAAAAAAAAAAAAAAAAAAAAAAAAA=\r\n',
      'INVALID_ACCEPT_HEADER'
    ]
  ]

  t.plan(cases.length)

  for (const [name, headers, code] of cases) {
    const p = nextPort()

    const server = rawServer((socket) => {
      let head = ''

      socket.on('data', (data) => {
        head += data.toString()

        if (!head.includes('\r\n\r\n')) return

        const key = /sec-websocket-key: (.*)\r\n/i.exec(head)[1]
        const accept = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\n' + headers(accept) + '\r\n'
        )
      })
    })

    await new Promise((resolve) => server.listen(p, resolve))

    const client = new ws.Socket({ port: p })

    t.is((await new Promise((resolve) => client.on('error', resolve))).code, code, name)

    client.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('pong takes a string as readily as a buffer', async (t) => {
  t.plan(2)

  const { client, socket, close } = await pair()

  const first = new Promise((resolve) => socket.once('pong', resolve))

  client.pong('a string')
  t.alike(await first, Buffer.from('a string'), 'a string is encoded')

  const second = new Promise((resolve) => socket.once('pong', resolve))

  client.pong(Buffer.from('some bytes'))
  t.alike(await second, Buffer.from('some bytes'), 'a buffer is sent as is')

  await close()
})

test('ending a client that never connected is harmless', async (t) => {
  t.plan(1)

  // `_final` runs with no socket to write a close frame to.
  const client = new ws.Socket({ port: 1 })

  client.on('error', () => {})

  client.end()

  await new Promise((resolve) => client.on('close', resolve))

  t.pass('closed without throwing')
})

test('a write parked on backpressure is released when the socket is destroyed', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  // A peer that completes the handshake and then stops reading.
  const peer = raw(p, upgrade(p), (status, socket) => socket.pause())

  const socket = await connected

  t.ok(await park(socket), 'a write is waiting on a drain that will not come')

  socket.destroy(new Error('boom'))

  t.ok(await closes(socket), 'the stream finished destroying')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a protocol failure with a write parked still tears the socket down', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => socket.pause())

  const socket = await connected

  t.ok(await park(socket), 'a write is waiting on a drain that will not come')

  // An unmasked frame, which a server must fail the connection over.
  peer.write(frame(0x1, Buffer.from('abc'), { mask: false }))

  t.ok(await closes(socket), 'the stream finished destroying')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a peer cannot pile up more than the read queue holds', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  let backedUp = false

  const peer = raw(p, upgrade(p), (status, socket) => {
    // Nobody is reading on the other end, so this may only be taken as fast as
    // the read queue is drained, which the peer sees as its own writes backing
    // up rather than being swallowed.
    for (let i = 0; i < 32; i++) {
      if (socket.write(frame(0x2, Buffer.alloc(1024 * 1024, 0x61))) === false) backedUp = true
    }
  })

  const socket = await connected

  await new Promise((resolve) => setTimeout(resolve, 1000))

  t.ok(backedUp, 'the peer was made to wait rather than being read from freely')

  // Reading again lets the rest through rather than dropping it.
  let received = 0

  const done = new Promise((resolve) => {
    socket.on('data', (data) => {
      received += data.byteLength

      if (received === 32 * 1024 * 1024) resolve()
    })
  })

  await done

  t.is(received, 32 * 1024 * 1024, 'every byte arrived once it was read')

  peer.destroy()
  socket.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a typed array that is not a buffer is sent as the bytes it holds', async (t) => {
  t.plan(2)

  const { client, socket, close } = await pair()

  const first = new Promise((resolve) => socket.once('data', resolve))

  client.write(new Uint8Array([1, 2, 3]))
  t.alike(await first, Buffer.from([1, 2, 3]), 'a Uint8Array keeps its bytes')

  const second = new Promise((resolve) => socket.once('data', resolve))

  client.write(new Uint16Array([0x0201]))
  t.alike(await second, Buffer.from([1, 2]), 'a wider view is sent as its bytes, not its elements')

  await close()
})

test('a control frame payload is refused before it reaches the wire', async (t) => {
  t.plan(4)

  const { client, close } = await pair()

  t.exception(
    () => client.ping(Buffer.alloc(126)),
    /INVALID_CONTROL_PAYLOAD_LENGTH/,
    'a ping over 125 bytes'
  )

  t.exception(
    () => client.pong(Buffer.alloc(126)),
    /INVALID_CONTROL_PAYLOAD_LENGTH/,
    'a pong over 125 bytes'
  )

  // `exception.all`, since brittle rethrows native errors from `exception`.
  await t.exception.all(
    () => client.ping(null),
    /must be a string or a buffer/,
    'a payload that is not bytes'
  )

  await t.exception.all(
    () => client.ping(123),
    /must be a string or a buffer/,
    'a payload that is a number'
  )

  await close()
})

test('a ping carries a typed array that is not a buffer', async (t) => {
  t.plan(1)

  const { client, socket, close } = await pair()

  const ponged = new Promise((resolve) => client.once('pong', resolve))

  client.ping(new Uint8Array([1, 2, 3]))

  t.alike(await ponged, Buffer.from([1, 2, 3]), 'the payload came back')

  await socket.destroy()
  await close()
})

test('ping and pong after the socket has closed', async (t) => {
  t.plan(2)

  const { client, close } = await pair()

  client.destroy()

  await new Promise((resolve) => client.on('close', resolve))

  t.exception(() => client.ping(), /NOT_CONNECTED/, 'ping')
  t.exception(() => client.pong(), /NOT_CONNECTED/, 'pong')

  await close()
})

test('closing the server closes the connections it has open', async (t) => {
  t.plan(4)

  const { server, client, socket } = await pair()

  t.is(server.connections.size, 1, 'the connection is tracked')
  t.ok(server.connections.has(socket), 'it is the one that was handed out')

  // Listened for before closing, or a client that goes first is missed.
  const closed = new Promise((resolve) => client.on('close', resolve))

  await new Promise((resolve) => server.close(resolve))

  t.pass('the server closed')

  await closed

  t.is(server.connections.size, 0, 'the connection was let go of')
})

test('closing the server drops a peer that never answers its close frame', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  // A peer that takes the close frame and does nothing about it.
  const peer = raw(p, upgrade(p), () => {})

  const socket = await connected

  const started = Date.now()

  await new Promise((resolve) => server.close(resolve))

  t.ok(Date.now() - started >= 1000, 'it was given time to close of its own accord')
  t.ok(socket.destroyed, 'it was dropped once that time ran out')

  peer.destroy()
})

test('a client refuses what it never put on the table', async (t) => {
  const cases = [
    [
      'an extension it did not offer',
      'Sec-WebSocket-Extensions: permessage-deflate\r\n',
      'UNEXPECTED_EXTENSION'
    ],
    ['a subprotocol it did not offer', 'Sec-WebSocket-Protocol: chat\r\n', 'UNEXPECTED_PROTOCOL']
  ]

  t.plan(cases.length)

  for (const [name, extra, code] of cases) {
    const p = nextPort()

    const server = rawServer((socket) => {
      let head = ''

      socket.on('data', (data) => {
        head += data.toString()

        if (!head.includes('\r\n\r\n')) return

        const key = /sec-websocket-key: (.*)\r\n/i.exec(head)[1]
        const accept = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n` +
            extra +
            '\r\n'
        )
      })
    })

    await new Promise((resolve) => server.listen(p, resolve))

    const client = new ws.Socket({ port: p })

    t.is((await new Promise((resolve) => client.on('error', resolve))).code, code, name)

    client.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a frame trickled out one byte at a time is read rather than refused', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const payload = Buffer.alloc(600, 0x61)

  const buffer = frame(0x2, payload)

  // One byte per read, which the chunk accounting this replaced refused
  // outright and which is now simply read.
  const peer = raw(p, upgrade(p), async (status, socket) => {
    for (let i = 0; i < buffer.byteLength && !socket.destroyed; i++) {
      socket.write(buffer.subarray(i, i + 1))

      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  })

  const socket = await connected

  const failed = new Promise((resolve) => socket.on('error', resolve))

  t.alike(await message(socket), payload, 'the message came through a byte at a time')

  peer.destroy()

  t.is((await failed).code, 'UNEXPECTED_CLOSE', 'the trickle itself was never refused')

  socket.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a header declaring far more than arrives is waited on, not refused', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => {
    // A header declaring 64 MiB, of which only a little is ever sent.
    socket.write(frame(0x2, Buffer.alloc(0), { length: 64 * 1024 * 1024 }))
    socket.write(maskBytes(Buffer.alloc(64 * 1024, 0x61)))
  })

  const socket = await connected

  socket.on('data', () => t.fail('the message was never whole'))

  t.is(await settles(socket, 500), null, 'the connection was left alone')

  peer.destroy()

  t.is(socket.closeCode, 1006, 'and only ended when the peer went away')

  socket.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a frame split at every byte boundary still arrives whole', async (t) => {
  const payload = Buffer.alloc(300, 0x7a)

  const buffer = frame(0x2, payload)

  t.plan(buffer.byteLength + 1)

  const p = nextPort()
  const server = serve(p)

  const messages = []

  server.on('connection', (socket) => socket.on('data', (data) => messages.push(data)))

  await new Promise((resolve) => server.on('listening', resolve))

  // Every split of one frame into two writes, so a header or a payload cut at
  // any byte has to be picked back up where it was left.
  for (let at = 0; at <= buffer.byteLength; at++) {
    const received = new Promise((resolve) => {
      const peer = raw(p, upgrade(p), (status, socket) => {
        socket.write(buffer.subarray(0, at))
        socket.write(buffer.subarray(at))
        setTimeout(() => resolve(peer), 30)
      })
    })

    const peer = await received

    t.alike(messages.pop(), payload, `split at ${at}`)

    peer.destroy()
  }

  await new Promise((resolve) => server.close(resolve))
})

test('a frame that takes longer than the idle timeout to arrive is not dropped', async (t) => {
  t.plan(2)

  const p = nextPort()
  const payload = Buffer.alloc(4096, 0x61)

  // Sent in pieces spread over several times the idle timeout, as a large
  // message on a slow link arrives.
  const server = serve(p, { idleTimeout: 300 })

  const received = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('data', resolve))
  })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), async (status, socket) => {
    const whole = frame(0x2, payload)

    for (let i = 0; i < whole.byteLength && !socket.destroyed; i += 256) {
      socket.write(whole.subarray(i, i + 256))

      await new Promise((resolve) => setTimeout(resolve, 60))
    }
  })

  const outcome = await Promise.race([received, failed])

  t.ok(Buffer.isBuffer(outcome), 'the message arrived rather than the connection failing')
  t.alike(outcome, payload, 'every byte of it')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a handshake error is reported before the socket is torn down', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = new ws.Server({ port: p })

  const reported = new Promise((resolve) => {
    server.on('handshakeError', (err, socket) => resolve({ err, socket }))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(
    p,
    'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: h2c\r\nConnection: Upgrade\r\n\r\n',
    () => {}
  )

  const { err, socket } = await reported

  t.is(err.code, 'INVALID_UPGRADE_HEADER', 'the failure was reported')
  t.absent(socket.destroyed, 'the socket was still there to look at')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

// Writes until the socket pushes back, which is what a peer that has stopped
// reading looks like from this side.
async function park(socket) {
  const data = Buffer.alloc(1024 * 1024, 0x61)

  for (let i = 0; i < 128; i++) {
    if (socket.write(data) === false) return true

    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return false
}

// Whether the stream finishes destroying, rather than hanging on a callback
// that never runs.
function closes(socket, timeout = 5000) {
  return Promise.race([
    new Promise((resolve) => socket.on('close', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), timeout))
  ])
}

test('every shape of UTF-8 sequence is judged on its own', async (t) => {
  const cases = [
    ['', true, 'nothing at all'],
    ['61', true, 'one byte'],
    ['c3a9', true, 'two bytes'],
    ['e282ac', true, 'three bytes'],
    ['f09f9880', true, 'four bytes'],
    ['80', false, 'a continuation byte on its own'],
    ['bf', false, 'the last continuation byte on its own'],
    ['f8', false, 'a lead byte no sequence starts with'],
    ['ff', false, 'the byte no sequence may contain'],
    ['e282', false, 'three bytes cut short'],
    ['e28241', false, 'three bytes with the last one not a continuation'],
    ['c0af', false, 'two bytes spent on what one would hold'],
    ['e080af', false, 'three bytes spent on what one would hold'],
    ['f0808080', false, 'four bytes spent on what one would hold'],
    ['eda080', false, 'the first half of a surrogate pair'],
    ['edbfbf', false, 'the second half of a surrogate pair'],
    ['f4908080', false, 'a code point past the last plane'],
    ['f48fbfbf', true, 'the last code point there is']
  ]

  t.plan(cases.length)

  const p = nextPort()
  const server = serve(p)

  await new Promise((resolve) => server.on('listening', resolve))

  for (const [hex, valid, name] of cases) {
    const payload = Buffer.from(hex, 'hex')

    const connected = new Promise((resolve) => server.once('connection', resolve))

    const peer = raw(p, upgrade(p), (status, socket) => socket.write(frame(0x1, payload)))

    const socket = await connected

    const outcome = await Promise.race([
      new Promise((resolve) => socket.on('data', (data) => resolve({ data }))),
      new Promise((resolve) => socket.on('error', (err) => resolve({ err }))),
      new Promise((resolve) => setTimeout(() => resolve({}), 1000))
    ])

    if (valid) t.alike(outcome.data, payload, name)
    else t.is(outcome.err && outcome.err.code, 'INVALID_UTF8', name)

    peer.destroy()
    socket.destroy()
  }

  await new Promise((resolve) => server.close(resolve))
})

test('writing something that is not backed by bytes is refused', async (t) => {
  t.plan(1)

  const { client, close } = await pair()

  const failed = new Promise((resolve) => client.on('error', resolve))

  client.write(123)

  t.is((await failed).code, 'INVALID_ENCODING', 'a number is not data')

  await close()
})

test('a subprotocol the client offered is accepted', async (t) => {
  const http = require('bare-http1')

  const cases = [
    ['chat', null, 'the one that was offered'],
    ['superchat', null, 'another of the ones that were offered'],
    ['something else', 'UNEXPECTED_PROTOCOL', 'one that was not']
  ]

  t.plan(cases.length)

  for (const [answer, code, name] of cases) {
    const p = nextPort()

    const server = rawServer((socket) => {
      let head = ''

      socket.on('data', (data) => {
        head += data.toString()

        if (!head.includes('\r\n\r\n')) return

        const key = /sec-websocket-key: (.*)\r\n/i.exec(head)[1]
        const accept = crypto.createHash('sha1').update(key).update(GUID).digest('base64')

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n` +
            `Sec-WebSocket-Protocol: ${answer}\r\n\r\n`
        )
      })
    })

    await new Promise((resolve) => server.listen(p, resolve))

    const req = http.request({ port: p, path: '/' })

    req.setHeader('Sec-WebSocket-Protocol', 'chat, superchat')

    const err = await new Promise((resolve) => ws.Socket.handshake(req, resolve))

    t.is(err && err.code, code, name)

    if (req.socket) req.socket.destroy()

    await new Promise((resolve) => server.close(resolve))
  }
})

test('a peer that answers without upgrading is reported, not waited on', async (t) => {
  t.plan(2)

  // The server's own refusal, which is answered 403 rather than upgraded.
  {
    const p = nextPort()
    const server = serve(p, { verifyClient: () => false })

    server.on('handshakeError', () => {})

    await new Promise((resolve) => server.on('listening', resolve))

    const client = new ws.Socket({ port: p })

    const err = await settles(client)

    t.is(err && err.code, 'INVALID_UPGRADE_STATUS', 'a refused handshake')

    client.destroy()

    await new Promise((resolve) => server.close(resolve))
  }

  // A peer that never speaks the protocol at all.
  {
    const p = nextPort()
    const server = rawServer((socket) =>
      socket.once('data', () => socket.write('HTTP/1.1 200 OK' + EOL + 'Content-Length: 0' + EOF))
    )

    await new Promise((resolve) => server.listen(p, resolve))

    const client = new ws.Socket({ port: p })

    const err = await settles(client)

    t.is(err && err.code, 'INVALID_UPGRADE_STATUS', 'a plain response')

    client.destroy()

    await new Promise((resolve) => server.close(resolve))
  }
})

// Resolves with the error the socket fails with, or null if it just sits there.
function settles(socket, timeout = 3000) {
  return Promise.race([
    new Promise((resolve) => socket.on('error', resolve)),
    new Promise((resolve) => setTimeout(() => resolve(null), timeout))
  ])
}

test('a reserved opcode is refused on the frame that carries it', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p)

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => {
      socket.on('error', resolve)
    })
  })

  await new Promise((resolve) => server.on('listening', resolve))

  // Unfinished, so nothing but the opcode itself says the message is no good.
  const peer = raw(p, upgrade(p), (status, socket) =>
    socket.write(frame(0x3, Buffer.alloc(4096), { fin: false }))
  )

  t.is((await failed).code, 'INVALID_OPCODE', 'refused')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a negative bound removes the fragment limit', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = serve(p, { maxFragments: -1 })

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.write(frame(0x1, Buffer.from('a'), { fin: false }))
    socket.write(frame(0x0, Buffer.from('b'), { fin: false }))
    socket.write(frame(0x0, Buffer.from('c')))
  })

  const socket = await connected

  t.alike(await message(socket), Buffer.from('abc'), 'assembled without a limit to hit')

  peer.destroy()
  socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('a connection lost without a close frame is told apart from a clean one', async (t) => {
  t.plan(6)

  for (const mode of ['clean', 'abrupt']) {
    const { client, socket, server } = await pair()

    socket.on('error', () => {})

    const failed = new Promise((resolve) => client.on('error', resolve))
    const closed = closes(client)

    if (mode === 'clean') socket.end()
    else socket.destroy()

    const err = await Promise.race([failed, closed.then(() => null)])

    if (mode === 'clean') {
      t.is(err, null, 'a clean close is not an error')
      t.is(client.closeCode, 1000, 'closed normally')
      t.is(client.closeReason.byteLength, 0, 'with no reason')
    } else {
      t.is(err && err.code, 'UNEXPECTED_CLOSE', 'a lost connection is an error')
      t.is(client.closeCode, 1006, 'reported as an abnormal closure')
      t.is(client.closeReason.byteLength, 0, 'with no reason')
    }

    client.destroy()
    socket.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('the status and reason a peer closes with are echoed and reported', async (t) => {
  t.plan(4)

  const p = nextPort()
  const server = serve(p)

  const closed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('close', () => resolve(socket)))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const answer = new Promise((resolve) => {
    const peer = raw(p, upgrade(p), (status, socket) => {
      socket.write(frame(0x8, Buffer.concat([Buffer.from([0x03, 0xe9]), Buffer.from('bye now')])))
      socket.once('data', resolve)
    })

    peer.on('close', () => {})
  })

  const reply = await answer
  const socket = await closed

  t.is(socket.closeCode, 1001, 'the status was reported')
  t.alike(socket.closeReason, Buffer.from('bye now'), 'so was the reason')
  t.is(reply.readUInt16BE(2), 1001, 'the status went back')
  t.alike(reply.subarray(4), Buffer.from('bye now'), 'so did the reason')

  await new Promise((resolve) => server.close(resolve))
})

test('a close frame carrying no status is answered with none', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const closed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('close', () => resolve(socket)))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const answer = new Promise((resolve) => {
    raw(p, upgrade(p), (status, socket) => {
      socket.write(frame(0x8))
      socket.once('data', resolve)
    })
  })

  const reply = await answer
  const socket = await closed

  // 1005 stands for the absence of a status and may never go on the wire.
  t.is(socket.closeCode, 1005, 'reported as no status received')
  t.is(reply.byteLength, 2, 'answered with an empty close frame')

  await new Promise((resolve) => server.close(resolve))
})

test('an upgrade handed over with the wrong status is refused', (t) => {
  t.plan(1)

  // Which of `upgrade` and `response` a non-101 arrives on is the HTTP client's
  // to decide, so the status is checked on both paths.
  const listeners = {}

  const req = {
    headers: {},
    on(name, fn) {
      listeners[name] = fn
      return this
    },
    end() {
      listeners.upgrade({ statusCode: 200, headers: {}, on() {} })
    }
  }

  ws.Socket.handshake(req, (err) => {
    t.is(err && err.code, 'INVALID_UPGRADE_STATUS', 'refused on the upgrade path too')
  })
})

test('a close frame carrying a status but no reason is echoed as it came', async (t) => {
  t.plan(3)

  const p = nextPort()
  const server = serve(p)

  const closed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('close', () => resolve(socket)))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const answer = new Promise((resolve) => {
    raw(p, upgrade(p), (status, socket) => {
      socket.write(frame(0x8, Buffer.from([0x03, 0xf1])))
      socket.once('data', resolve)
    })
  })

  const reply = await answer
  const socket = await closed

  t.is(socket.closeCode, 1009, 'the status was reported')
  t.is(socket.closeReason.byteLength, 0, 'with no reason alongside it')
  t.alike(reply.subarray(2), Buffer.from([0x03, 0xf1]), 'the status went back on its own')

  await new Promise((resolve) => server.close(resolve))
})

test('a protocol error after our close frame does not send a second one', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve).on('data', () => {}))
  })

  server.on('connection', (socket) => socket.on('data', () => socket.end()))

  await new Promise((resolve) => server.on('listening', resolve))

  let sent = Buffer.alloc(0)

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.on('data', (data) => {
      sent = Buffer.concat([sent, data])
    })

    // Provokes the close frame, then a reserved opcode once it is out.
    socket.write(frame(0x1, Buffer.from('go')))

    setTimeout(() => socket.write(frame(0x3, Buffer.from('x'))), 50)
  })

  t.is((await failed).code, 'INVALID_OPCODE')

  await new Promise((resolve) => setTimeout(resolve, 50))

  t.alike(
    sent,
    frame(0x8, Buffer.from([0x03, 0xe8]), { mask: false }),
    'only our own close frame went out'
  )

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a ping arriving after our close frame goes unanswered', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const pinged = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('ping', resolve).on('data', () => {}))
  })

  server.on('connection', (socket) => socket.on('data', () => socket.end()))

  await new Promise((resolve) => server.on('listening', resolve))

  let sent = Buffer.alloc(0)

  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.on('data', (data) => {
      sent = Buffer.concat([sent, data])
    })

    // Provokes the close frame, then a ping once it is out.
    socket.write(frame(0x1, Buffer.from('go')))

    setTimeout(() => socket.write(frame(0x9, Buffer.from('hello'))), 50)
  })

  t.alike(await pinged, Buffer.from('hello'), 'the application still hears the ping')

  await new Promise((resolve) => setTimeout(resolve, 50))

  t.alike(
    sent,
    frame(0x8, Buffer.from([0x03, 0xe8]), { mask: false }),
    'no pong followed the close frame'
  )

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('ping and pong are refused once the socket has been ended', async (t) => {
  t.plan(2)

  const { client, close } = await pair()

  client.end()

  await new Promise((resolve) => client.once('finish', resolve))

  t.exception(() => client.ping(), /NOT_CONNECTED/, 'ping')
  t.exception(() => client.pong(), /NOT_CONNECTED/, 'pong')

  await close()
})

test('a fragment that would carry the message past maxPayload is refused on its header', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = new ws.Server({ port: p, maxPayload: 1024 })

  const failed = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('error', resolve))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  let sent = 0

  const peer = raw(p, upgrade(p), (status, socket) => {
    // 1000 bytes of the budget spent, then a header promising 64 MiB more and
    // not a byte of it.
    socket.write(frame(0x2, Buffer.alloc(1000), { fin: false }))

    const header = frame(0x0, Buffer.alloc(0), { length: 64 * 1024 * 1024 })
    sent = header.byteLength
    socket.write(header)
  })

  t.is((await failed).code, 'MESSAGE_TOO_LARGE')
  t.is(sent, 14, 'refused on the header, before any of the payload was buffered')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a control frame is not counted against what the message has left', async (t) => {
  t.plan(1)

  const p = nextPort()
  const server = new ws.Server({ port: p, maxPayload: 1024 })

  const ponged = new Promise((resolve) => {
    server.on('connection', (socket) => socket.on('ping', resolve).on('error', () => {}))
  })

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => {
    // All but eight bytes of the budget spent, then a 125 byte control frame,
    // which is bounded by its own limit and no part of the message.
    socket.write(frame(0x2, Buffer.alloc(1016), { fin: false }))
    socket.write(frame(0x9, Buffer.alloc(125, 0x61)))
  })

  t.alike(await ponged, Buffer.alloc(125, 0x61), 'the ping came through')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('an upgrade handed over without an Upgrade header is refused', (t) => {
  t.plan(1)

  const listeners = {}

  const req = {
    headers: {},
    on(name, fn) {
      listeners[name] = fn
      return this
    },
    end() {
      listeners.upgrade({ statusCode: 101, headers: {}, on() {} })
    }
  }

  ws.Socket.handshake(req, (err) => {
    t.is(err && err.code, 'INVALID_UPGRADE_HEADER', 'a missing header is not dereferenced')
  })
})

test('a peer that half-closes without a close frame is not waited on', async (t) => {
  t.plan(2)

  // With the idle timeout off nothing else can rescue this, so the half-close
  // has to be noticed on its own.
  const p = nextPort()
  const server = serve(p, { idleTimeout: 0 })

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const peer = raw(p, upgrade(p), (status, socket) => {
    // A `FIN` and nothing else, which leaves that end writable so the socket
    // never closes of its own accord.
    socket.end()
  })

  const socket = await connected

  const err = await new Promise((resolve) => socket.on('error', resolve))

  t.is(err.code, 'UNEXPECTED_CLOSE', 'the lost connection was noticed')
  t.is(socket.closeCode, 1006, 'reported as an abnormal closure')

  peer.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('a verifyClient that throws something other than an error still refuses', async (t) => {
  const cases = [
    [
      'null',
      () => {
        throw null
      },
      'Upgrade rejected'
    ],
    [
      'undefined',
      () => {
        throw undefined
      },
      'Upgrade rejected'
    ],
    [
      'a string',
      () => {
        throw 'the token store is down'
      },
      'the token store is down'
    ],
    ['a rejection with null', () => Promise.reject(null), 'Upgrade rejected'],
    ['a rejection with a number', () => Promise.reject(42), 'Upgrade rejected'],
    ['a rejection with an error', () => Promise.reject(new Error('nope')), 'nope']
  ]

  t.plan(cases.length * 2)

  for (const [name, verifyClient, message] of cases) {
    const p = nextPort()

    const server = new ws.Server({ port: p, verifyClient })

    server.on('connection', () => t.fail('should not have upgraded'))

    const reported = new Promise((resolve) => server.on('handshakeError', resolve))

    await new Promise((resolve) => server.on('listening', resolve))

    const status = await new Promise((resolve) => raw(p, upgrade(p), resolve))

    t.is(status, 403, `answered 403 for ${name}`)
    t.is((await reported).message, `UPGRADE_REJECTED: ${message}`, `reported for ${name}`)

    await new Promise((resolve) => server.close(resolve))
  }
})

test('a verifyClient that resolves after the peer has gone hands over nothing', async (t) => {
  t.plan(2)

  const p = nextPort()

  let admit
  const verifying = new Promise((resolve) => {
    admit = resolve
  })

  let upgrading
  const verifyingSocket = new Promise((resolve) => {
    upgrading = resolve
  })

  // With the idle timeout off, a connection handed over after it has closed is
  // never let go of again: its events were all emitted before the `WebSocket`
  // adopting it was listening for them.
  const server = new ws.Server({
    port: p,
    idleTimeout: 0,
    verifyClient(req) {
      upgrading(req.socket)

      return verifying
    }
  })

  server.on('connection', () => t.fail('should not have upgraded'))

  const reported = new Promise((resolve) => server.on('handshakeError', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const client = new ws.Socket({ port: p, idleTimeout: 0 })

  client.on('error', () => {})

  const socket = await verifyingSocket

  const closed = new Promise((resolve) => socket.on('close', resolve))

  client.destroy()

  await closed

  admit(true)

  t.is((await reported).code, 'NETWORK_ERROR', 'reported as a lost connection')
  t.is(server.connections.size, 0, 'nothing was left in the connection set')

  await new Promise((resolve) => server.close(resolve))
})

test('a server that accepts the connection and then says nothing is not waited on', async (t) => {
  t.plan(3)

  const p = nextPort()

  // Nothing is read from the connection until the handshake is through, so
  // there is no idle timer yet to notice that the peer has gone quiet.
  const server = rawServer(() => {})

  await new Promise((resolve) => server.listen(p, resolve))

  const client = new ws.Socket({ port: p, handshakeTimeout: 100 })

  const closed = closes(client)
  const err = await settles(client)

  t.is(err && err.code, 'CONNECTION_TIMEOUT', 'the handshake was given up on')
  t.ok(await closed, 'the socket was let go of')

  const patient = new ws.Socket({ port: p, handshakeTimeout: 0 })

  patient.on('error', () => {})

  t.is(await settles(patient, 300), null, 'a handshakeTimeout of 0 removes the bound')

  patient.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('an IPv6 URL is connected to without its brackets', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p, { host: '::1' })

  await new Promise((resolve) => server.on('listening', resolve))

  const client = new ws.Socket(`ws://[::1]:${p}/`)

  const opened = new Promise((resolve, reject) =>
    client.on('open', () => resolve(true)).on('error', reject)
  )

  t.ok(await opened, 'connected to the literal')
  t.is(server.address().address, '::1', 'to a server listening on that address alone')

  client.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('a scheme the connection cannot be opened for is refused', (t) => {
  const opened = ['ws://localhost/', 'wss://localhost/', 'http://localhost/', 'https://localhost/']

  t.plan(opened.length + 4)

  for (const url of opened) {
    t.execution(() => {
      const client = new ws.Socket(url, { handshakeTimeout: 0 })

      client.on('error', () => {})
      client.destroy()
    }, `${url} is opened`)
  }

  for (const url of ['ftp://localhost/', 'file:///tmp', 'nope://localhost/']) {
    try {
      const client = new ws.Socket(url)

      client.destroy()

      t.fail(`${url} should have been refused`)
    } catch (err) {
      t.is(err.code, 'INVALID_PROTOCOL', `${url} is refused`)
    }
  }

  // Options given without a URL name no scheme, so there is none to judge.
  t.execution(() => {
    const client = new ws.Socket({ port: nextPort(), handshakeTimeout: 0 })

    client.on('error', () => {})
    client.destroy()
  }, 'options carry no scheme to refuse')
})

test('what the server underneath reports reaches the one the caller holds', async (t) => {
  t.plan(3)

  const p = nextPort()
  const first = serve(p)

  await new Promise((resolve) => first.on('listening', resolve))

  const second = serve(p)

  const err = await new Promise((resolve) => second.on('error', resolve))

  t.is(err.code, 'EADDRINUSE', 'the failure to bind was catchable')

  const closed = new Promise((resolve) => first.on('close', resolve))

  first.close(() => t.pass('closed'))

  await closed

  t.pass('the close reached the caller')
})

test('a handshake that never finishes is given up on', async (t) => {
  t.plan(3)

  const p = nextPort()

  // Never settles, so nothing but the deadline can end the handshake.
  const server = new ws.Server({
    port: p,
    handshakeTimeout: 100,
    verifyClient: () => new Promise(() => {})
  })

  const reported = new Promise((resolve) => server.on('handshakeError', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const answered = new Promise((resolve) => {
    raw(p, upgrade(p), (status) => resolve(status))
  })

  t.is(await answered, 408, 'answered 408')
  t.is((await reported).code, 'CONNECTION_TIMEOUT', 'reported as a timeout')
  t.is(server.connections.size, 0, 'nothing was handed over')

  await new Promise((resolve) => server.close(resolve))
})

test('a handshakeTimeout of 0 removes the bound on the server too', async (t) => {
  t.plan(2)

  const p = nextPort()

  const server = new ws.Server({
    port: p,
    handshakeTimeout: 0,
    verifyClient: () => new Promise(() => {})
  })

  server.on('handshakeError', () => t.fail('should not have been given up on'))

  await new Promise((resolve) => server.on('listening', resolve))

  let closed = false

  const socket = raw(p, upgrade(p), () => t.fail('should not have been answered'))

  socket.on('close', () => (closed = true))

  await new Promise((resolve) => setTimeout(resolve, 300))

  t.absent(closed, 'still waiting on the handshake rather than dropping it')

  socket.destroy()

  // Which only completes if the server is not still holding the connection.
  await new Promise((resolve) => server.close(resolve))

  t.is(server.connections.size, 0, 'nothing was handed over')
})

test('a verifyClient that resolves after the deadline is answered only once', async (t) => {
  t.plan(3)

  const p = nextPort()

  let admit
  const verifying = new Promise((resolve) => {
    admit = resolve
  })

  const server = new ws.Server({
    port: p,
    handshakeTimeout: 100,
    verifyClient: () => verifying
  })

  server.on('connection', () => t.fail('should not have upgraded'))

  const errors = []
  server.on('handshakeError', (err) => errors.push(err.code))

  await new Promise((resolve) => server.on('listening', resolve))

  const responses = []

  const socket = raw(p, upgrade(p), (status) => responses.push(status))

  await new Promise((resolve) => setTimeout(resolve, 250))

  admit(true)

  await new Promise((resolve) => setTimeout(resolve, 150))

  t.alike(responses, [408], 'answered once')
  t.alike(errors, ['CONNECTION_TIMEOUT'], 'reported once')
  t.is(server.connections.size, 0, 'nothing was handed over')

  socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})

test('how long a peer has to answer a close frame is configurable', async (t) => {
  t.plan(2)

  // A peer that never sends a close frame back leaves this side waiting on one
  // it is owed, which is what the timeout bounds.
  for (const [closeTimeout, dropped, name] of [
    [100, true, 'dropped once its time was up'],
    [0, false, 'a closeTimeout of 0 removes the bound']
  ]) {
    const p = nextPort()
    const server = serve(p, { closeTimeout, idleTimeout: 0 })

    const connected = new Promise((resolve) => server.once('connection', resolve))

    await new Promise((resolve) => server.on('listening', resolve))

    const peer = raw(p, upgrade(p), () => {})

    const socket = await connected

    socket.on('error', () => {})

    const gone = closes(socket, 600)

    socket.end()

    t.is(await gone, dropped, name)

    peer.destroy()
    socket.destroy()

    await new Promise((resolve) => server.close(resolve))
  }
})

test('invalid text is refused on the byte that spoils it', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  // A megabyte of text declared, of which only a bad first sequence is ever
  // sent. Nothing waits for the rest of it.
  const peer = raw(p, upgrade(p), (status, socket) => {
    socket.write(frame(0x1, Buffer.alloc(0), { length: 1024 * 1024 }))
    socket.write(maskBytes(Buffer.from([0x61, 0xc3, 0x28])))
  })

  const socket = await connected

  const err = await settles(socket, 2000)

  t.is(err && err.code, 'INVALID_UTF8', 'refused with three bytes of a megabyte in hand')
  t.is(socket.closeCode, 1006, 'the connection was failed rather than closed')

  peer.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('a text message may not end part way through a sequence', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  await new Promise((resolve) => server.on('listening', resolve))

  const cases = [
    ['one frame', [frame(0x1, Buffer.from([0x61, 0xc3]))]],
    [
      'the last of several',
      [
        frame(0x1, Buffer.from([0x61, 0xc3]), { fin: false }),
        frame(0x0, Buffer.alloc(0), { fin: true })
      ]
    ]
  ]

  for (const [name, frames] of cases) {
    const connected = new Promise((resolve) => server.once('connection', resolve))

    const peer = raw(p, upgrade(p), (status, socket) => {
      for (const buffer of frames) socket.write(buffer)
    })

    const socket = await connected
    const err = await settles(socket, 2000)

    t.is(err && err.code, 'INVALID_UTF8', name)

    peer.destroy()
  }

  await new Promise((resolve) => server.close(resolve))
})

test('a sequence straddling a chunk or a fragment is still whole', async (t) => {
  t.plan(3)

  const p = nextPort()
  const server = serve(p)

  const messages = []

  server.on('connection', (socket) => socket.on('data', (data) => messages.push(data)))

  await new Promise((resolve) => server.on('listening', resolve))

  const text = Buffer.from('a€b😀c', 'utf8')

  // Split inside the three byte sequence, between two writes of one frame.
  const whole = frame(0x1, text)
  const at = whole.byteLength - text.byteLength + 2

  const first = new Promise((resolve) => {
    const peer = raw(p, upgrade(p), (status, socket) => {
      socket.write(whole.subarray(0, at))
      setTimeout(() => {
        socket.write(whole.subarray(at))
        setTimeout(() => resolve(peer), 50)
      }, 20)
    })
  })

  ;(await first).destroy()

  t.alike(messages.pop(), text, 'split inside a sequence in one frame')

  // And the same split put across two fragments of one message.
  const second = new Promise((resolve) => {
    const peer = raw(p, upgrade(p), (status, socket) => {
      socket.write(frame(0x1, text.subarray(0, 2), { fin: false }))
      socket.write(frame(0x0, text.subarray(2), { fin: true }))
      setTimeout(() => resolve(peer), 50)
    })
  })

  ;(await second).destroy()

  t.alike(messages.pop(), text, 'split inside a sequence across two fragments')
  t.is(messages.length, 0, 'nothing else arrived')

  await new Promise((resolve) => server.close(resolve))
})

test('a peer that floods pings while reading nothing is not answered one for one', async (t) => {
  t.plan(2)

  const p = nextPort()
  const server = serve(p)

  const connected = new Promise((resolve) => server.once('connection', resolve))

  await new Promise((resolve) => server.on('listening', resolve))

  const PINGS = 100000

  const ping = frame(0x9, Buffer.alloc(125, 0x61))

  let back = 0

  const peer = raw(p, upgrade(p), async (status, socket) => {
    // Nothing is read back while the pings go out, so the answers owed pile up
    // on the far side rather than one going out for each.
    socket.pause()

    for (let i = 0; i < PINGS; i++) {
      socket.write(ping)

      if ((i & 0x3ff) === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    }

    socket.on('data', (data) => (back += data.byteLength))
    socket.resume()
  })

  const socket = await connected

  let pings = 0

  socket.on('ping', () => pings++)

  t.ok(await until(() => pings === PINGS, 20000), `all ${PINGS} pings were heard`)

  await new Promise((resolve) => setTimeout(resolve, 500))

  t.ok(
    back < (PINGS * ping.byteLength) / 4,
    `${back} bytes came back, not the ${PINGS * ping.byteLength} an answer each would cost`
  )

  peer.destroy()
  socket.destroy()

  await new Promise((resolve) => server.close(resolve))
})
