'use strict'

const { Transform } = require('readable-stream')
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
      // SubscriptionContext.close() has ended the queue.
      // Pushing after EOF emits an unhandled 'error' on the Readable and
      // crashes the process. The subscriber is gone — drop the message.
      // (`readableEnded` alone cannot guard this: it only becomes true once
      // 'end' has been emitted, which may be after the late delivery.)
      let unsubscribed = false
      function listener (value, cb) {
        if (unsubscribed || queue.destroyed || queue.readableEnded || queue.writableEnded) {
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

// The events of one subscription, waiting to be sent to its client. The
// emitter writes them and the subscription reads them. Once highWaterMark
// events wait to be read, the Transform holds the callback of the next write
// until the subscription reads one, and the writes after it wait in its
// writable buffer.
class SubscriptionQueue extends Transform {
  constructor (highWaterMark, overflow = 'buffer') {
    super({ objectMode: true, readableHighWaterMark: highWaterMark })
    this.overflow = overflow
  }

  // Adds an event from the emitter, and calls `callback` once the emitter can
  // go on. Once highWaterMark events wait to be read, `overflow` decides:
  // - 'buffer' adds the event anyway, so the queue has no limit;
  // - 'wait' adds it, and calls back once the event is in the readable side:
  //   publishers that wait for publish() wait for the slowest subscriber, and
  //   with a concurrency, the emitter waits for it;
  // - 'drop' discards the event;
  // - 'close' ends the subscription with an error.
  add (event, callback) {
    if (this.overflow === 'wait') {
      // a write destroyed before it is read fails: the emitter goes on anyway
      this.write(event, () => callback())
      return
    }
    if (this.readableLength >= this.readableHighWaterMark) {
      if (this.overflow === 'drop') {
        return callback()
      }
      if (this.overflow === 'close') {
        this.destroy(new MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL())
        return callback()
      }
    }
    this.write(event)
    callback()
  }

  _transform (event, encoding, callback) {
    callback(null, event)
  }

  _destroy (err, callback) {
    // A destroyed Transform does not call back the write it holds, nor the
    // writes behind it, and the emitter would wait for them forever. Reading
    // releases the held one, then the writable side fails the others.
    this._read()
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
  SubscriptionContext,
  withFilter
}
