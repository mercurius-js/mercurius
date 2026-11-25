'use strict'

const { addAbortListener } = require('node:events')
const { MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL } = require('./errors')

// What a subscription queue does with an event once it holds `queueHighWaterMark` of them.
const QUEUE_OVERFLOW = ['buffer', 'wait', 'drop', 'close']

function done () {
  return { value: undefined, done: true }
}

// The events of one subscription, waiting to be sent to its client: the pubsub
// pushes them, and the subscription reads them as an async iterator.
//
// push() never waits: it returns false once the queue holds highWaterMark
// events, as Readable.push() did. What happens to an event pushed to a full
// queue depends on its overflow (queueOverflow): with 'buffer' and 'wait', it
// is kept. A producer that wants backpressure waits for waitForCapacity()
// before pushing again: with 'wait', the built-in PubSub does.
class SubscriptionQueue {
  #highWaterMark
  #overflow
  #log
  #events = []
  #head = 0
  // reads waiting for an event
  #reads = []
  // waitForCapacity() calls waiting for the queue to have room, created on
  // the first one
  #waiters = null
  #ended = false
  #destroyed = false
  #error = null

  constructor ({ highWaterMark, overflow = 'buffer', log } = {}) {
    this.#highWaterMark = highWaterMark ?? 16
    this.#overflow = overflow
    this.#log = log
  }

  get highWaterMark () {
    return this.#highWaterMark
  }

  get overflow () {
    return this.#overflow
  }

  // The number of events not read yet
  get length () {
    return this.#events.length - this.#head
  }

  push (event) {
    // null ends the queue, as it ended the Readable the queue used to be
    if (event === null) {
      this.end()
      return false
    }
    // a late delivery, after the subscription has ended, is dropped
    if (this.#ended || this.#destroyed) {
      return false
    }
    if (this.#reads.length > 0) {
      this.#reads.shift().resolve({ value: event, done: false })
      return true
    }
    if (this.length >= this.#highWaterMark) {
      if (this.#overflow === 'drop') {
        return false
      }
      if (this.#overflow === 'close') {
        this.#log?.warn('subscription closed: its client does not read its events fast enough')
        this.destroy(new MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL())
        return false
      }
    }
    this.#events.push(event)
    return this.length < this.#highWaterMark
  }

  // Resolves true once the queue holds fewer than highWaterMark events, or
  // false once it has ended or been destroyed, even if it still holds events.
  // Every waiter is resolved: the room is not reserved for any of them.
  // Aborting the signal rejects this wait only.
  waitForCapacity ({ signal } = {}) {
    if (signal?.aborted) {
      return Promise.reject(signal.reason)
    }
    if (this.#ended || this.#destroyed) {
      return Promise.resolve(false)
    }
    if (this.length < this.#highWaterMark) {
      return Promise.resolve(true)
    }
    return new Promise((resolve, reject) => {
      const waiters = this.#waiters ??= new Set()
      if (!signal) {
        waiters.add(resolve)
        return
      }
      const abort = addAbortListener(signal, () => {
        waiters.delete(waiter)
        reject(signal.reason)
      })
      function waiter (ready) {
        abort[Symbol.dispose]()
        resolve(ready)
      }
      waiters.add(waiter)
    })
  }

  next () {
    if (this.length > 0) {
      const event = this.#events[this.#head]
      this.#events[this.#head++] = undefined
      if (this.#head === this.#events.length) {
        this.#events = []
        this.#head = 0
      } else if (this.#head >= 1024 && this.#head * 2 >= this.#events.length) {
        // compact the backing array of a long backlog
        this.#events = this.#events.slice(this.#head)
        this.#head = 0
      }
      if (this.#waiters !== null && this.length < this.#highWaterMark) {
        this.#releaseWaiters(true)
      }
      return Promise.resolve({ value: event, done: false })
    }
    if (this.#error !== null) {
      const error = this.#error
      this.#error = null
      return Promise.reject(error)
    }
    if (this.#ended || this.#destroyed) {
      return Promise.resolve(done())
    }
    return new Promise((resolve, reject) => {
      this.#reads.push({ resolve, reject })
    })
  }

  // The subscription stopped reading: its events are dropped
  return () {
    this.destroy()
    return Promise.resolve(done())
  }

  [Symbol.asyncIterator] () {
    return this
  }

  // No event is pushed anymore: the subscription reads the ones left, then
  // is done
  end () {
    if (this.#ended) {
      return
    }
    this.#ended = true
    this.#releaseWaiters(false)
    this.#endReads()
  }

  // Ends the subscription now, dropping its events. With an error, its next
  // read rejects with it.
  destroy (error) {
    if (this.#destroyed) {
      return
    }
    this.#destroyed = true
    this.#events = []
    this.#head = 0
    this.#releaseWaiters(false)
    if (error) {
      const read = this.#reads.shift()
      if (read) {
        read.reject(error)
      } else {
        this.#error = error
      }
    }
    this.#endReads()
  }

  #releaseWaiters (ready) {
    const waiters = this.#waiters
    if (waiters === null) {
      return
    }
    this.#waiters = null
    for (const waiter of waiters) {
      waiter(ready)
    }
  }

  #endReads () {
    const reads = this.#reads
    this.#reads = []
    for (const read of reads) {
      read.resolve(done())
    }
  }
}

module.exports = SubscriptionQueue
module.exports.QUEUE_OVERFLOW = QUEUE_OVERFLOW
