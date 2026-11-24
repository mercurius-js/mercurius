'use strict'

const { MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL } = require('./errors')

// The internals of SubscriptionQueue, kept off its public surface.
const kHighWaterMark = Symbol('mercurius.queue.highWaterMark')
const kOverflow = Symbol('mercurius.queue.overflow')
const kLog = Symbol('mercurius.queue.log')
const kEvents = Symbol('mercurius.queue.events')
const kHead = Symbol('mercurius.queue.head')
const kWaiting = Symbol('mercurius.queue.waiting')
const kDrains = Symbol('mercurius.queue.drains')
const kReads = Symbol('mercurius.queue.reads')
const kEnded = Symbol('mercurius.queue.ended')
const kDestroyed = Symbol('mercurius.queue.destroyed')
const kError = Symbol('mercurius.queue.error')
const kReleasePublishers = Symbol('mercurius.queue.releasePublishers')
const kReleaseDrains = Symbol('mercurius.queue.releaseDrains')
const kEndReads = Symbol('mercurius.queue.endReads')

// What a subscription queue does with an event once it holds
// `queueHighWaterMark` of them.
const QUEUE_OVERFLOW = ['buffer', 'wait', 'drop', 'close']

class PubSub {
  constructor (emitter) {
    this.emitter = emitter
  }

  subscribe (topic, queue) {
    return new Promise((resolve, reject) => {
      // Emitters with asynchronous delivery (e.g. mqemitter-redis) may deliver
      // a message after close() has run: the subscriber is gone, so it is
      // dropped, here or by the queue, which ignores events once it has ended.
      let unsubscribed = false
      function listener (value, cb) {
        if (unsubscribed) {
          return cb()
        }
        queue.add(value.payload, cb)
      }

      const close = () => {
        unsubscribed = true
        this.emitter.removeListener(topic, listener)
      }

      this.emitter.on(topic, listener, (err) => {
        if (err) {
          return reject(err)
        }

        resolve()
      })
      queue.close.push(close)
    })
  }

  // Without a callback, returns a promise that resolves once the event is
  // delivered: with queueOverflow 'wait', once the subscriptions whose queue
  // is full have read from it. The promise never rejects, so that a publish
  // nobody awaits cannot crash the process: an error of the emitter is ignored,
  // as it was before. Pass a callback to get it.
  publish (event, callback) {
    if (typeof callback === 'function') {
      this.emitter.emit(event, callback)
      return
    }
    let delivered
    const promise = new Promise((resolve) => { delivered = resolve })
    this.emitter.emit(event, () => delivered())
    return promise
  }
}

function noop () {}

function done () {
  return { value: undefined, done: true }
}

// The events of one subscription, waiting to be sent to its client: the pubsub
// adds them, and the subscription reads them as an async iterator.
class SubscriptionQueue {
  constructor ({ highWaterMark = 16, overflow = 'buffer', log } = {}) {
    this[kHighWaterMark] = highWaterMark
    this[kOverflow] = overflow
    this[kLog] = log
    // the events not read yet are this[kEvents] from this[kHead] on
    this[kEvents] = []
    this[kHead] = 0
    // with 'wait', the callbacks of the last events, those past highWaterMark
    this[kWaiting] = []
    // the callbacks of waitForRoom(): the queue is full
    this[kDrains] = []
    // the reads waiting for an event: the queue is empty
    this[kReads] = []
    this[kEnded] = false
    this[kDestroyed] = false
    this[kError] = null
    // The functions that unsubscribe the pubsub from the queue, called by
    // SubscriptionContext.close(). A custom pubsub may also replace it with a
    // single function.
    this.close = []
  }

  get highWaterMark () {
    return this[kHighWaterMark]
  }

  get length () {
    return this[kEvents].length - this[kHead]
  }

  // Adds an event without waiting, and returns false once the queue is full or
  // closed: a publisher can push a burst of events, and once push() returns
  // false, wait for waitForRoom() before it pushes again. With 'wait', events
  // pushed anyway are kept past highWaterMark, as with 'buffer'.
  push (event) {
    this.add(event, noop)
    return !this[kEnded] && !this[kDestroyed] && this.length < this[kHighWaterMark]
  }

  // Calls `callback`, or resolves the promise it returns without one, once the
  // queue holds fewer than highWaterMark events, or has closed.
  waitForRoom (callback) {
    if (typeof callback !== 'function') {
      return new Promise((resolve) => this.waitForRoom(resolve))
    }
    // a destroyed queue is empty
    if (this.length < this[kHighWaterMark] || this[kEnded]) {
      callback()
      return
    }
    this[kDrains].push(callback)
  }

  // Adds an event, and calls `callback` once the publisher can go on. Once the
  // queue holds highWaterMark events, `overflow` decides:
  // - 'buffer' adds the event anyway, so the queue has no limit;
  // - 'wait' adds it, and calls back once the subscription has read enough for
  //   it to be among the first highWaterMark: publishers that wait for
  //   publish() wait for the slowest subscriber, and with a concurrency, the
  //   emitter waits for it;
  // - 'drop' discards the event;
  // - 'close' ends the subscription with an error.
  add (event, callback) {
    if (this[kEnded] || this[kDestroyed]) {
      return callback()
    }
    if (this[kReads].length > 0) {
      this[kReads].shift().resolve({ value: event, done: false })
      return callback()
    }
    if (this.length >= this[kHighWaterMark] && this[kOverflow] !== 'buffer') {
      if (this[kOverflow] === 'wait') {
        this[kEvents].push(event)
        this[kWaiting].push(callback)
        return
      }
      if (this[kOverflow] === 'close') {
        this[kLog]?.warn('subscription closed: its client does not read its events fast enough')
        this.destroy(new MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL())
      }
      return callback()
    }
    this[kEvents].push(event)
    callback()
  }

  next () {
    if (this.length > 0) {
      const event = this[kEvents][this[kHead]]
      this[kEvents][this[kHead]++] = undefined
      if (this[kHead] === this[kEvents].length) {
        this[kEvents] = []
        this[kHead] = 0
      } else if (this[kHead] >= 1024 && this[kHead] * 2 >= this[kEvents].length) {
        this[kEvents] = this[kEvents].slice(this[kHead])
        this[kHead] = 0
      }
      while (this[kWaiting].length > 0 && this.length - this[kWaiting].length < this[kHighWaterMark]) {
        this[kWaiting].shift()()
      }
      if (this[kDrains].length > 0 && this.length < this[kHighWaterMark]) {
        this[kReleaseDrains]()
      }
      return Promise.resolve({ value: event, done: false })
    }
    if (this[kError] !== null) {
      const error = this[kError]
      this[kError] = null
      return Promise.reject(error)
    }
    if (this[kEnded] || this[kDestroyed]) {
      return Promise.resolve(done())
    }
    return new Promise((resolve, reject) => {
      this[kReads].push({ resolve, reject })
    })
  }

  return () {
    this.destroy()
    return Promise.resolve(done())
  }

  [Symbol.asyncIterator] () {
    return this
  }

  // No event is added anymore: the subscription reads the ones left, then is
  // done. The publishers waiting for it, with add() or waitForRoom(), go on.
  end () {
    if (this[kEnded]) {
      return
    }
    this[kEnded] = true
    this[kReleasePublishers]()
    this[kEndReads]()
  }

  // Ends the subscription now, dropping its events. With an error, its next
  // read rejects with it.
  destroy (error) {
    if (this[kDestroyed]) {
      return
    }
    this[kDestroyed] = true
    this[kEvents] = []
    this[kHead] = 0
    this[kReleasePublishers]()
    if (error) {
      const read = this[kReads].shift()
      if (read) {
        read.reject(error)
      } else {
        this[kError] = error
      }
    }
    this[kEndReads]()
  }

  // Each of these empties its list before calling it back: a callback may add
  // to the same list, e.g. a publisher released by this[kReleaseDrains]() that
  // pushes, and waits for room again.

  // calls back every publisher waiting with add() or waitForRoom()
  [kReleasePublishers] () {
    const waiting = this[kWaiting]
    this[kWaiting] = []
    for (const callback of waiting) {
      callback()
    }
    this[kReleaseDrains]()
  }

  // calls back every publisher waiting with waitForRoom()
  [kReleaseDrains] () {
    const drains = this[kDrains]
    this[kDrains] = []
    for (const callback of drains) {
      callback()
    }
  }

  // ends every read waiting for an event
  [kEndReads] () {
    const reads = this[kReads]
    this[kReads] = []
    for (const read of reads) {
      read.resolve(done())
    }
  }
}

// One context - and queue for each subscription
class SubscriptionContext {
  constructor ({ pubsub, fastify, queueHighWaterMark, queueOverflow }) {
    this.fastify = fastify
    this.pubsub = pubsub
    this.queue = new SubscriptionQueue({
      highWaterMark: queueHighWaterMark,
      overflow: queueOverflow,
      log: fastify?.log
    })
    this.closed = false
  }

  // `topics` param can be:
  // - string: subscribe to a single topic
  // - array: subscribe to multiple topics
  subscribe (topics, ...customArgs) {
    if (typeof topics === 'string') {
      return this.pubsub.subscribe(topics, this.queue, ...customArgs).then(() => this.queue)
    }
    return Promise.all(topics.map((topic) => this.pubsub.subscribe(topic, this.queue, ...customArgs))).then(() => this.queue)
  }

  publish (event) {
    return new Promise((resolve, reject) => {
      this.pubsub.publish(event, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    }).catch(err => {
      this.fastify.log.error(err)
    })
  }

  close () {
    if (this.closed) {
      return false
    }
    const close = this.queue.close
    this.queue.close = []
    if (typeof close === 'function') {
      close()
    } else {
      for (const unsubscribe of close) {
        unsubscribe()
      }
    }
    this.queue.end()
    this.closed = true
    return true
  }
}

function withFilter (subscribeFn, filterFn) {
  return async function * (root, args, context, info) {
    const subscription = (await subscribeFn(root, args, context, info))[Symbol.asyncIterator]()

    const newAsyncIterator = {
      next: async () => {
        while (true) {
          const { value, done } = await subscription.next()
          if (done) {
            return { done: true }
          }
          try {
            if (await filterFn(value, args, context, info)) {
              return { value, done: false }
            }
          } catch (err) {
            context.app.log.error(err)
          }
        }
      },
      return: async () => {
        /* c8 ignore next 10 */
        if (typeof subscription.return === 'function') {
          return await subscription.return()
        }
        return { done: true }
      },
      [Symbol.asyncIterator] () {
        return this
      }
    }

    yield * newAsyncIterator
  }
}

module.exports = {
  QUEUE_OVERFLOW,
  PubSub,
  SubscriptionQueue,
  SubscriptionContext,
  withFilter
}
