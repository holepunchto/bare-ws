// https://datatracker.ietf.org/doc/html/rfc6455#section-8.1
module.exports = function isValidUTF8(buffer) {
  const n = buffer.byteLength

  let i = 0

  while (i < n) {
    const b = buffer[i]

    if (b < 0x80) {
      i++
      continue
    }

    let length
    let min
    let point

    if ((b & 0xe0) === 0xc0) {
      length = 1
      point = b & 0x1f
      min = 0x80
    } else if ((b & 0xf0) === 0xe0) {
      length = 2
      point = b & 0x0f
      min = 0x800
    } else if ((b & 0xf8) === 0xf0) {
      length = 3
      point = b & 0x07
      min = 0x10000
    } else {
      return false
    }

    if (i + length >= n) return false

    for (let j = 1; j <= length; j++) {
      const c = buffer[i + j]

      if ((c & 0xc0) !== 0x80) return false

      point = (point << 6) | (c & 0x3f)
    }

    // Overlong, past the last plane, or half a surrogate pair.
    if (point < min || point > 0x10ffff) return false
    if (point >= 0xd800 && point <= 0xdfff) return false

    i += length + 1
  }

  return true
}
