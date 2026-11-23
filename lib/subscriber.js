'use strict'

const { MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL } = require('./errors')

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
    this.highWaterMark = highWaterMark
    this.overflow = overflow
    this.log = log
    // the events not read yet are events[head..]
    this.events = []
    this.head = 0
    // with 'wait', the callbacks of the last events, those past highWaterMark
    this.waiting = []
    // the reads waiting for an event: the queue is empty
    this.reads = []
    this.ended = false
    this.destroyed = false
    this.error = null
    // The functions that unsubscribe the pubsub from the queue, called by
    // SubscriptionContext.close(). A custom pubsub may also replace it with a
    // single function.
    this.close = []
  }

  get length () {
    return this.events.length - this.head
  }

  // Adds an event, and returns false once the queue holds highWaterMark events.
  push (event) {
    this.add(event, noop)
    return this.length < this.highWaterMark
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
    if (this.ended || this.destroyed) {
      return callback()
    }
    if (this.reads.length > 0) {
      this.reads.shift().resolve({ value: event, done: false })
      return callback()
    }
    if (this.length >= this.highWaterMark && this.overflow !== 'buffer') {
      if (this.overflow === 'wait') {
        this.events.push(event)
        this.waiting.push(callback)
        return
      }
      if (this.overflow === 'close') {
        this.log?.warn('subscription closed: its client does not read its events fast enough')
        this.destroy(new MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL())
      }
      return callback()
    }
    this.events.push(event)
    callback()
  }

  next () {
    if (this.length > 0) {
      const event = this.events[this.head]
      this.events[this.head++] = undefined
      if (this.head === this.events.length) {
        this.events = []
        this.head = 0
      } else if (this.head >= 1024 && this.head * 2 >= this.events.length) {
        this.events = this.events.slice(this.head)
        this.head = 0
      }
      while (this.waiting.length > 0 && this.length - this.waiting.length < this.highWaterMark) {
        this.waiting.shift()()
      }
      return Promise.resolve({ value: event, done: false })
    }
    if (this.error !== null) {
      const error = this.error
      this.error = null
      return Promise.reject(error)
    }
    if (this.ended || this.destroyed) {
      return Promise.resolve(done())
    }
    return new Promise((resolve, reject) => {
      this.reads.push({ resolve, reject })
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
  // done. The publishers waiting for it go on.
  end () {
    if (this.ended) {
      return
    }
    this.ended = true
    this.releasePublishers()
    this.endReads()
  }

  // Ends the subscription now, dropping its events. With an error, its next
  // read rejects with it.
  destroy (error) {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    this.events = []
    this.head = 0
    this.releasePublishers()
    if (error) {
      const read = this.reads.shift()
      if (read) {
        read.reject(error)
      } else {
        this.error = error
      }
    }
    this.endReads()
  }

  releasePublishers () {
    const waiting = this.waiting
    this.waiting = []
    for (const callback of waiting) {
      callback()
    }
  }

  endReads () {
    const reads = this.reads
    this.reads = []
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
