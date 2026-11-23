'use strict'

const { Readable } = require('readable-stream')
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
      // A message can be delivered after the subscription has closed:
      // emitters with asynchronous delivery (e.g. mqemitter-redis) may have
      // a message in flight when close() runs, and deliver it after
      // SubscriptionContext.close() has ended the queue with push(null).
      // Pushing after EOF emits an unhandled 'error' on the Readable and
      // crashes the process. The subscriber is gone — drop the message.
      // (`readableEnded` alone cannot guard this: it only becomes true once
      // 'end' has been emitted, which may be after the late delivery.)
      let unsubscribed = false
      function listener (value, cb) {
        if (unsubscribed || queue.destroyed || queue.readableEnded) {
          return cb()
        }
        if (queue instanceof SubscriptionQueue) {
          queue.add(value.payload, cb)
        } else {
          queue.push(value.payload)
          cb()
        }
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
      if (!queue.close) queue.close = []
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

// The events of one subscription, waiting to be sent to its client
class SubscriptionQueue extends Readable {
  constructor (highWaterMark, overflow = 'buffer') {
    super({ objectMode: true, highWaterMark })
    this.overflow = overflow
    this.waitingForRoom = []
  }

  // Adds an event from the emitter, and calls `callback` once the emitter can
  // go on. Once the queue holds highWaterMark events, `overflow` decides:
  // - 'buffer' adds the event anyway, so the queue has no limit;
  // - 'wait' adds it, and calls back only once the subscription reads from the
  //   queue: publishers that wait for publish() wait for the slowest
  //   subscriber, and with a concurrency, the emitter waits for it;
  // - 'drop' discards the event;
  // - 'close' ends the subscription with an error.
  add (event, callback) {
    const full = this.readableLength >= this.readableHighWaterMark
    if (full && this.overflow === 'drop') {
      // the subscription misses the event
    } else if (full && this.overflow === 'close') {
      this.destroy(new MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL())
    } else if (!this.push(event) && this.overflow === 'wait') {
      this.waitingForRoom.push(callback)
      return
    }
    callback()
  }

  release () {
    const waiting = this.waitingForRoom
    this.waitingForRoom = []
    for (const callback of waiting) {
      callback()
    }
  }

  _read () {
    this.release()
  }

  _destroy (err, callback) {
    this.release()
    callback(err)
  }
}

// One context - and queue for each subscription
class SubscriptionContext {
  constructor ({ pubsub, fastify, queueHighWaterMark, queueOverflow }) {
    this.fastify = fastify
    this.pubsub = pubsub
    this.queue = new SubscriptionQueue(queueHighWaterMark, queueOverflow)
    // Defence in depth: an unhandled 'error' event on the queue kills the
    // whole process. Log it and move on — the subscription is dead anyway.
    this.queue.on('error', (err) => {
      if (err instanceof MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL) {
        this.fastify?.log?.warn('subscription closed: its client does not read its events fast enough')
        return
      }
      this.fastify?.log?.error({ err }, 'subscription queue error (suppressed)')
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
    // In rare cases when `subscribe()` not called (e.g. some network error)
    // `close` will be `undefined`.
    if (Array.isArray(this.queue.close)) {
      this.queue.close.map((close) => close())
      delete this.queue.close
    }
    this.queue.push(null)
    // nothing will be pushed anymore: the publishers waiting for room go on
    this.queue.release()
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
  SubscriptionContext,
  withFilter
}
