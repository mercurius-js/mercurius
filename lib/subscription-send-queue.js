'use strict'

const WebSocket = require('ws')

// Limits the bytes that a subscription connection has passed to ws and that
// the kernel has not accepted yet.
//
// Until the kernel accepts it, which is when the callback of `socket.send()`
// runs, data waits in Node ahead of anything written after it, including the
// pongs that ws writes to answer pings. Each subscription waits for its
// previous message to be accepted, but a connection with many subscriptions
// can still have one message of each waiting there. Past `highWaterMark`
// bytes, messages wait in this queue instead, where keep-alive messages and
// pongs can get ahead of them.
//
// The kernel accepts data as long as its socket buffers have room, so this does
// not limit them: on Linux, the net.ipv4.tcp_notsent_lowat sysctl does.
class SendQueue {
  constructor (socket, highWaterMark) {
    this.socket = socket
    this.highWaterMark = highWaterMark
    this.pending = 0
    this.queue = []

    socket.on('close', () => this.onClose())
  }

  // Sends `data` once fewer than `highWaterMark` bytes are pending, and calls
  // `callback` like `socket.send()` does.
  send (data, callback) {
    if (this.socket.readyState !== WebSocket.OPEN || (this.queue.length === 0 && this.pending < this.highWaterMark)) {
      // A socket that is not open fails it, as it does without a queue.
      this.write(data, callback)
    } else {
      this.queue.push({ data, callback })
    }
  }

  // Sends `data` now, ahead of the queued messages.
  write (data, callback) {
    const size = Buffer.byteLength(data)
    this.pending += size
    this.socket.send(data, (err) => {
      this.pending -= size
      callback(err)
      this.flush()
    })
  }

  flush () {
    while (this.queue.length > 0 && this.pending < this.highWaterMark && this.socket.readyState === WebSocket.OPEN) {
      const { data, callback } = this.queue.shift()
      this.write(data, callback)
    }
  }

  onClose () {
    // The client is gone: the queued messages are dropped, and their senders
    // released so that they do not wait forever.
    const queue = this.queue
    this.queue = []
    for (const { callback } of queue) {
      callback()
    }
  }
}

module.exports = SendQueue
