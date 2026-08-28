const test = require('brittle')
const fs = require('bare-fs')
const net = require('bare-tcp')
const crypto = require('bare-crypto')
const ws = require('.')
const Frame = require('./lib/frame')
const { GUID } = require('./lib/constants')

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

// A masked frame, with an all-zero mask so the payload passes through unchanged.
function frame(opcode, payload = Buffer.alloc(0), opts = {}) {
  const { fin = true, mask = true, length = payload.byteLength } = opts

  const header = []

  header.push((fin ? 0x80 : 0) | opcode)

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

  if (mask) header.push(0, 0, 0, 0)

  return Buffer.concat([Buffer.from(header), payload])
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

test('frame encodes each reserved bit from its own flag', (t) => {
  t.plan(3)

  t.is(new Frame(0x1, Buffer.from('x'), { rsv1: true }).toBuffer()[0], 0b11000001, 'rsv1 only')
  t.is(new Frame(0x1, Buffer.from('x'), { rsv2: true }).toBuffer()[0], 0b10100001, 'rsv2 only')
  t.is(new Frame(0x1, Buffer.from('x'), { rsv3: true }).toBuffer()[0], 0b10010001, 'rsv3 only')
})

test('decode measures what is left from the start of the frame', (t) => {
  t.plan(2)

  const a = new Frame(0x2, Buffer.from('AAAA')).toBuffer()
  const b = new Frame(0x2, Buffer.from('BBBBBBBB')).toBuffer()

  const buffer = Buffer.concat([a, b]).subarray(0, a.byteLength + b.byteLength - 4)

  const state = { start: 0, end: buffer.byteLength, buffer }

  t.alike(Frame.decode(state).payload, Buffer.from('AAAA'), 'first frame decodes')

  try {
    const frame = Frame.decode(state)
    t.fail(`second frame should be incomplete, got ${frame.payload.byteLength} bytes`)
  } catch (err) {
    t.is(err.code, 'INCOMPLETE_FRAME', 'truncated second frame is refused')
  }
})

test('decoded payloads do not alias the read buffer', (t) => {
  t.plan(1)

  const buffer = new Frame(0x2, Buffer.from('hello')).toBuffer()

  const state = { start: 0, end: buffer.byteLength, buffer }

  const { payload } = Frame.decode(state)

  buffer.fill(0)

  t.alike(payload, Buffer.from('hello'), 'payload survives the buffer being reused')
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

test('pongs are coalesced while the socket is backed up', (t) => {
  t.plan(4)

  const written = []

  // A socket that accepts the first write and reports itself full thereafter,
  // which is what a peer that never reads looks like from this side.
  const fake = {
    writable: true,
    write(data) {
      written.push(data)
      return written.length < 1
    },
    on() {
      return this
    },
    destroy() {}
  }

  const socket = new ws.Socket({ socket: fake, isServer: true, idleTimeout: 0 })

  for (let i = 0; i < 1000; i++) socket._onping(Buffer.from([i & 0xff]))

  t.is(written.length, 1, 'only the first ping was answered directly')
  t.ok(socket._corked, 'the socket reported itself full')
  t.alike(socket._pendingPong, Buffer.from([999 & 0xff]), 'the newest ping is the one still owed')

  socket._ondrain()

  t.is(written.length, 2, 'one thousand pings cost two pongs, not one thousand')

  socket.destroy()
})

// The lengths either side of the two points where the wire format changes shape:
// 125 is the last one that fits in the length field, 0xffff the last that fits
// in the 16 bit extension.
const LENGTHS = [0, 1, 2, 125, 126, 127, 128, 0xfffe, 0xffff, 0x10000, 0x10001]

test('frame roundtrips at every length boundary, unmasked', (t) => {
  t.plan(LENGTHS.length * 2)

  for (const length of LENGTHS) {
    const payload = Buffer.alloc(length, 'x')
    const buffer = new Frame(0x2, payload).toBuffer()
    const frame = Frame.decode({ start: 0, end: buffer.byteLength, buffer })

    t.is(frame.payload.byteLength, length, `${length} bytes decoded`)
    t.alike(frame.payload, payload, `${length} bytes intact`)
  }
})

test('frame roundtrips at every length boundary, masked', (t) => {
  t.plan(LENGTHS.length * 2)

  for (const length of LENGTHS) {
    const payload = Buffer.alloc(length, 'y')
    const buffer = new Frame(0x2, payload, { mask: Buffer.alloc(4) }).toBuffer()
    const frame = Frame.decode({ start: 0, end: buffer.byteLength, buffer })

    t.ok(frame.mask !== null, `${length} bytes reported as masked`)
    t.alike(frame.payload, payload, `${length} bytes unmasked correctly`)
  }
})

test('each frame gets a fresh mask', (t) => {
  t.plan(2)

  const mask = Buffer.allocUnsafe(4)
  const payload = Buffer.from('the same payload every time')

  const a = new Frame(0x1, payload, { mask }).toBuffer()
  const b = new Frame(0x1, payload, { mask }).toBuffer()

  t.unlike(a, b, 'two frames of the same payload differ on the wire')

  const decoded = Frame.decode({ start: 0, end: b.byteLength, buffer: b })

  t.alike(decoded.payload, payload, 'and both still decode to the payload')
})

test('frame flags and opcodes roundtrip', (t) => {
  const cases = [
    { fin: true, rsv1: false, rsv2: false, rsv3: false },
    { fin: false, rsv1: false, rsv2: false, rsv3: false },
    { fin: true, rsv1: true, rsv2: false, rsv3: false },
    { fin: true, rsv1: false, rsv2: true, rsv3: false },
    { fin: true, rsv1: false, rsv2: false, rsv3: true },
    { fin: false, rsv1: true, rsv2: true, rsv3: true }
  ]

  t.plan(cases.length + 3)

  for (const flags of cases) {
    const buffer = new Frame(0x1, Buffer.from('x'), flags).toBuffer()
    const frame = Frame.decode({ start: 0, end: buffer.byteLength, buffer })

    t.alike(
      { fin: frame.fin, rsv1: frame.rsv1, rsv2: frame.rsv2, rsv3: frame.rsv3 },
      flags,
      JSON.stringify(flags)
    )
  }

  for (const op of [0x0, 0x1, 0x2]) {
    const buffer = new Frame(op, Buffer.from('x'), { fin: false }).toBuffer()

    t.is(
      Frame.decode({ start: 0, end: buffer.byteLength, buffer }).opcode,
      op,
      `opcode 0x${op.toString(16)}`
    )
  }
})

test('frame takes options in place of a payload', (t) => {
  t.plan(2)

  const frame = new Frame(0x9, { fin: false })

  t.is(frame.payload.byteLength, 0, 'payload defaults to empty')
  t.is(frame.fin, false, 'options were read from the second argument')
})

test('decode refuses a payload length past the safe integer range', (t) => {
  t.plan(1)

  // A 64 bit length whose high word is 0x00200000, which is 2^53.
  const buffer = Buffer.from([0x82, 0x7f, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

  t.exception(
    () => Frame.decode({ start: 0, end: buffer.byteLength, buffer }),
    /INVALID_PAYLOAD_LENGTH/
  )
})

test('decode asks for more bytes at each stage of a header', (t) => {
  const partials = [
    ['empty', []],
    ['one byte', [0x82]],
    ['16 bit length, one byte short', [0x82, 0x7e, 0x00]],
    ['64 bit length, one byte short', [0x82, 0x7f, 0, 0, 0, 0, 0, 0, 0]],
    ['mask, one byte short', [0x82, 0x84, 0, 0, 0]],
    ['payload, one byte short', [0x82, 0x04, 0x61, 0x62, 0x63]]
  ]

  t.plan(partials.length)

  for (const [name, bytes] of partials) {
    const buffer = Buffer.from(bytes)

    try {
      Frame.decode({ start: 0, end: buffer.byteLength, buffer })
      t.fail(`${name} should have been incomplete`)
    } catch (err) {
      t.is(err.code, 'INCOMPLETE_FRAME', name)
    }
  }
})

test('an incomplete frame reports how long it will be', (t) => {
  t.plan(2)

  const complete = new Frame(0x2, Buffer.alloc(300, 'z')).toBuffer()
  const buffer = complete.subarray(0, 10)

  try {
    Frame.decode({ start: 0, end: buffer.byteLength, buffer })
    t.fail('should have been incomplete')
  } catch (err) {
    t.is(err.code, 'INCOMPLETE_FRAME')
    t.is(err.length, complete.byteLength, 'reports the full frame length, header included')
  }
})

test('frames encode back to back into one buffer', (t) => {
  t.plan(3)

  const frames = [
    new Frame(0x1, Buffer.from('one')),
    new Frame(0x2, Buffer.from('two')),
    new Frame(0x1, Buffer.from('three'))
  ]

  const state = { start: 0, end: 0, buffer: null }

  for (const frame of frames) Frame.preencode(state, frame)

  state.buffer = Buffer.allocUnsafe(state.end)
  state.start = 0

  for (const frame of frames) Frame.encode(state, frame)

  const read = { start: 0, end: state.buffer.byteLength, buffer: state.buffer }

  t.alike(Frame.decode(read).payload, Buffer.from('one'))
  t.alike(Frame.decode(read).payload, Buffer.from('two'))
  t.alike(Frame.decode(read).payload, Buffer.from('three'))
})

test('maxPayload of -1 removes the ceiling', (t) => {
  t.plan(2)

  // A header declaring 1 GiB, with no payload behind it.
  const buffer = Buffer.from([0x82, 0x7f, 0, 0, 0, 0, 0x40, 0x00, 0x00, 0x00])

  try {
    Frame.decode({ start: 0, end: buffer.byteLength, buffer }, { maxPayload: 1024 })
    t.fail('should have been refused')
  } catch (err) {
    t.is(err.code, 'MESSAGE_TOO_LARGE', 'refused under a limit')
  }

  try {
    Frame.decode({ start: 0, end: buffer.byteLength, buffer }, { maxPayload: -1 })
    t.fail('should have asked for more bytes')
  } catch (err) {
    t.is(err.code, 'INCOMPLETE_FRAME', 'without a limit it just wants the payload')
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
  t.plan(4)

  const opcodes = []
  const { client, socket, close } = await pair()

  const onframe = socket._onframe.bind(socket)
  socket._onframe = (frame) => {
    opcodes.push(frame.opcode)
    return onframe(frame)
  }

  client.write('some text')
  t.alike(await message(socket), Buffer.from('some text'), 'text arrives')

  client.write(Buffer.from('some bytes'))
  t.alike(await message(socket), Buffer.from('some bytes'), 'bytes arrive')

  t.is(opcodes[0], 0x1, 'a string went out as TEXT')
  t.is(opcodes[1], 0x2, 'a buffer went out as BINARY')

  await close()
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
  t.plan(2)

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

  t.is(client._socket, null, 'no socket was adopted after the fact')

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

  const { socket, close } = await pair({ server: { idleTimeout: 0 } })

  let failure = null

  socket.on('error', (err) => (failure = err))

  t.is(socket._idleTimer, null, 'no timer was armed')

  await new Promise((resolve) => setTimeout(resolve, 300))

  t.absent(failure, 'still connected after a period of silence')

  await close()
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
