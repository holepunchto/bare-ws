// https://datatracker.ietf.org/doc/html/rfc6455#section-8.1
//
// Judges a run of bytes that may be handed over in as many pieces as it arrives
// in, carrying the state of a sequence that straddles two of them, so that a
// message is refused on the byte that spoils it rather than once all of it has
// been read.
module.exports = exports = class UTF8Validator {
  constructor() {
    // The code point so far, how many continuation bytes it is still owed, and
    // the smallest value a sequence of its length may encode.
    this._point = 0
    this._remaining = 0
    this._min = 0
  }

  // Whether every sequence handed over so far was whole. A run may not end part
  // way through one.
  get complete() {
    return this._remaining === 0
  }

  reset() {
    this._point = 0
    this._remaining = 0
    this._min = 0
  }

  push(buffer, start = 0, end = buffer.byteLength) {
    let point = this._point
    let remaining = this._remaining
    let min = this._min

    let i = start
    let valid = true

    while (i < end) {
      if (remaining > 0) {
        const c = buffer[i++]

        if ((c & 0xc0) !== 0x80) {
          valid = false
          break
        }

        point = (point << 6) | (c & 0x3f)

        if (--remaining === 0 && invalid(point, min)) {
          valid = false
          break
        }

        continue
      }

      const b = buffer[i++]

      if (b < 0x80) continue

      if ((b & 0xe0) === 0xc0) {
        remaining = 1
        point = b & 0x1f
        min = 0x80
      } else if ((b & 0xf0) === 0xe0) {
        remaining = 2
        point = b & 0x0f
        min = 0x800
      } else if ((b & 0xf8) === 0xf0) {
        remaining = 3
        point = b & 0x07
        min = 0x10000
      } else {
        valid = false
        break
      }
    }

    this._point = point
    this._remaining = remaining
    this._min = min

    return valid
  }
}

const UTF8Validator = exports

// Judges a run that is already whole, for the places where one is.
exports.validate = function validate(buffer) {
  const validator = new UTF8Validator()

  return validator.push(buffer) && validator.complete
}

// Overlong, past the last plane, or half a surrogate pair.
function invalid(point, min) {
  if (point < min || point > 0x10ffff) return true

  return point >= 0xd800 && point <= 0xdfff
}
