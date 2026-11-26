'use strict'

const SubscriptionQueue = require('./subscription-queue')

class PubSub {
  constructor (emitter) {
    this.emitter = emitter
  }

  subscribe (topic, queue) {
    return new Promise((resolve, reject) => {
      // A message can be delivered after the subscription has closed:
      // emitters with asynchronous delivery (e.g. mqemitter-redis) may have
      // a message in flight when close() runs. The subscriber is gone: the
      // message is dropped, here or by the queue, which ignores the events
      // pushed once it has ended.
      let unsubscribed = false
      // With queueOverflow 'wait', the emitter is called back once a full
      // queue has room again: until then, publishers that wait for publish()
      // wait, and an emitter with a concurrency stops delivering.
      const wait = queue.overflow === 'wait'
      function listener (value, cb) {
        if (unsubscribed || queue.push(value.payload) || !wait) {
          return cb()
        }
        queue.waitForCapacity().then(() => cb())
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
  // delivered: with queueOverflow 'wait', once the queues that are full have
  // room again. The promise never rejects, so that a publish nobody awaits
  // cannot crash the process: an error of the emitter is ignored, as it was
  // before. Pass a callback to get it.
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
  PubSub,
  SubscriptionContext,
  withFilter
}
