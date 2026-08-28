const { isFinished, isWritable } = require('bare-stream')
const { CLOSE_TIMEOUT } = require('./constants')

// Destroys once the last of the socket has gone out, so a close frame written
// just beforehand is not dropped. The grace bounds a peer that stops reading;
// zero removes the bound and waits for the write side to finish on its own.
exports.destroySoon = function destroySoon(socket, grace = CLOSE_TIMEOUT) {
  if (socket.destroying) return

  if (isWritable(socket)) socket.end()

  if (isFinished(socket)) return socket.destroy()

  let timer = null

  if (grace > 0) {
    timer = setTimeout(() => socket.destroy(), grace)

    timer.unref()
  }

  socket.once('finish', () => {
    if (timer !== null) clearTimeout(timer)

    socket.destroy()
  })
}
