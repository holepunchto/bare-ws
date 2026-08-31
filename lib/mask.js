// https://datatracker.ietf.org/doc/html/rfc6455#section-5.3
//
// A payload is masked with a key that repeats every four bytes, so which byte
// of the key applies to a given byte is decided by where in the payload it
// sits, and by nothing else. A payload can therefore be masked or unmasked in
// as many pieces as it arrives in, as long as each piece says where in the
// payload it begins.

// Under this many bytes the views cost more than the words they save, and a
// control frame never carries more than a handful.
const WIDE = 64

// Masks `length` bytes of `payload`, from `start`, into `target`.
exports.mask = function mask(payload, start, target, targetStart, length, key) {
  xor(payload, start, target, targetStart, length, key, start)
}

// Unmasks `length` bytes of `source`, from `start`, into `payload`.
exports.unmask = function unmask(source, start, payload, payloadStart, length, key) {
  xor(source, start, payload, payloadStart, length, key, payloadStart)
}

function xor(source, sourceStart, target, targetStart, length, key, position) {
  let i = 0

  if (length >= WIDE) {
    // Which byte of the key a run begins on decides the word every one of its
    // words is masked with, the key repeating as often as the run advances.
    const r = position & 3

    const word =
      ((key[r] << 24) | (key[(r + 1) & 3] << 16) | (key[(r + 2) & 3] << 8) | key[(r + 3) & 3]) >>> 0

    const s = new DataView(source.buffer, source.byteOffset, source.byteLength)
    const t = new DataView(target.buffer, target.byteOffset, target.byteLength)

    const n = length - (length % 4)

    for (; i < n; i += 4) {
      t.setUint32(targetStart + i, s.getUint32(sourceStart + i, false) ^ word, false)
    }
  }

  for (; i < length; i++) {
    target[targetStart + i] = source[sourceStart + i] ^ key[(position + i) & 3]
  }
}
