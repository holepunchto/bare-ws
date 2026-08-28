const { isFinished, isWritable } = require('bare-stream')

// Destroys once the last of the socket has gone out, so a close frame written
// just beforehand is not dropped. The grace bounds a peer that stops reading.
exports.destroySoon = function destroySoon(socket, grace = 5000) {
  if (socket.destroying) return

  if (isWritable(socket)) socket.end()

  if (isFinished(socket)) return socket.destroy()

  const timer = setTimeout(() => socket.destroy(), grace)

  timer.unref()

  socket.once('finish', () => {
    clearTimeout(timer)

    socket.destroy()
  })
}
