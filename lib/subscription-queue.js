'use strict'

const { MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL } = require('./errors')

// What a subscription queue does with an event once it holds
// `queueHighWaterMark` of them.
const QUEUE_OVERFLOW = ['buffer', 'wait', 'drop', 'close']

function done () {
  return { value: undefined, done: true }
}

// The events of one subscription, waiting to be sent to its client: the pubsub
// pushes them, and the subscription reads them as an async iterator.
class SubscriptionQueue {
  #highWaterMark
  #overflow
  #log
  // the events not read yet are #events[#head..]
  #events = []
  #head = 0
  // the callbacks of waitForRoom(): the queue is full
  #drains = []
  // the reads waiting for an event: the queue is empty
  #reads = []
  #ended = false
  #destroyed = false
  #error = null

  constructor ({ highWaterMark = 16, overflow = 'buffer', log } = {}) {
    this.#highWaterMark = highWaterMark
    this.#overflow = overflow
    this.#log = log
    // The functions that unsubscribe the pubsub from the queue, called by
    // SubscriptionContext.close(). A custom pubsub may also replace it with a
    // single function.
    this.close = []
  }

  get highWaterMark () {
    return this.#highWaterMark
  }

  // What happens to an event pushed to a full queue: see push().
  get overflow () {
    return this.#overflow
  }

  get length () {
    return this.#events.length - this.#head
  }

  // Adds an event without waiting, and returns false once the queue holds
  // highWaterMark events, or has closed: a publisher can push a burst of
  // events, and once push() returns false, wait for waitForRoom() before it
  // pushes again. An event pushed to a full queue is:
  // - kept with 'buffer' and 'wait', so the queue has no limit of its own:
  //   with 'wait', the publisher is expected to wait for room;
  // - discarded with 'drop';
  // - the end of the subscription, with an error, with 'close'.
  push (event) {
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

  // Calls `callback`, or resolves the promise it returns without one, once the
  // queue holds fewer than highWaterMark events, or has closed.
  waitForRoom (callback) {
    if (typeof callback !== 'function') {
      return new Promise((resolve) => this.waitForRoom(resolve))
    }
    // a destroyed queue is empty
    if (this.length < this.#highWaterMark || this.#ended) {
      callback()
      return
    }
    this.#drains.push(callback)
  }

  next () {
    if (this.length > 0) {
      const event = this.#events[this.#head]
      this.#events[this.#head++] = undefined
      if (this.#head === this.#events.length) {
        this.#events = []
        this.#head = 0
      } else if (this.#head >= 1024 && this.#head * 2 >= this.#events.length) {
        this.#events = this.#events.slice(this.#head)
        this.#head = 0
      }
      if (this.#drains.length > 0 && this.length < this.#highWaterMark) {
        this.#releaseDrains()
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

  return () {
    this.destroy()
    return Promise.resolve(done())
  }

  [Symbol.asyncIterator] () {
    return this
  }

  // No event is pushed anymore: the subscription reads the ones left, then is
  // done. The publishers waiting for room go on.
  end () {
    if (this.#ended) {
      return
    }
    this.#ended = true
    this.#releaseDrains()
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
    this.#releaseDrains()
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

  // Calls back every publisher waiting for room. The list is emptied first: a
  // publisher may push, and wait for room again, from its callback.
  #releaseDrains () {
    const drains = this.#drains
    this.#drains = []
    for (const callback of drains) {
      callback()
    }
  }

  // Ends every read waiting for an event.
  #endReads () {
    const reads = this.#reads
    this.#reads = []
    for (const read of reads) {
      read.resolve(done())
    }
  }
}

module.exports = {
  QUEUE_OVERFLOW,
  SubscriptionQueue
}
