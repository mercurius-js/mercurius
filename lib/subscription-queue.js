'use strict'

const { addAbortListener } = require('node:events')
const { Readable } = require('readable-stream')

const kWaiters = Symbol('waiters')
const kEnded = Symbol('ended')
const kNotify = Symbol('notify')

// Keep the stream API and push() semantics. Capacity waiting is opt-in: the
// queue neither drops events nor makes the built-in PubSub block publishers.
class SubscriptionQueue extends Readable {
  constructor (highWaterMark) {
    super({ objectMode: true, highWaterMark })
    this[kWaiters] = new Set()
    this[kEnded] = false
  }

  _read () {}

  read (size) {
    const value = super.read(size)
    // _read() can run before the buffered value is removed. Notify after read()
    // instead, when readableLength reflects the capacity actually available.
    this[kNotify]()
    return value
  }

  push (chunk, encoding) {
    if (chunk === null) this[kEnded] = true
    const result = super.push(chunk, encoding)
    if (chunk === null) this[kNotify]()
    return result
  }

  _destroy (error, callback) {
    this[kNotify]()
    callback(error)
  }

  // true means capacity was observed, not reserved. false means the queue has
  // ended or been destroyed, even if buffered events have not been read yet.
  waitForCapacity ({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason)
    if (this[kEnded] || this.destroyed) return Promise.resolve(false)
    if (this.readableLength < this.readableHighWaterMark) return Promise.resolve(true)

    return new Promise((resolve, reject) => {
      let abortListener
      const cleanup = () => {
        this[kWaiters].delete(done)
        abortListener?.[Symbol.dispose]()
      }
      const done = (ready) => {
        cleanup()
        resolve(ready)
      }
      const onAbort = () => {
        cleanup()
        reject(signal.reason)
      }
      this[kWaiters].add(done)
      if (signal) abortListener = addAbortListener(signal, onAbort)
    })
  }

  [kNotify] () {
    if (this[kWaiters].size === 0) return
    const open = !this[kEnded] && !this.destroyed
    if (open && this.readableLength >= this.readableHighWaterMark) return
    for (const done of this[kWaiters]) done(open)
  }
}

module.exports = SubscriptionQueue
