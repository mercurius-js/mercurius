'use strict'

const { Readable } = require('readable-stream')

class PubSub {
  constructor (emitter) {
    this.emitter = emitter
  }

  subscribe (topic, queue) {
    return new Promise((resolve, reject) => {
      function listener (value, cb) {
        queue.push(value.payload)
        cb()
      }

      const close = () => {
        this.emitter.removeListener(topic, listener)
      }

      this.emitter.on(topic, listener, (err) => {
        if (err) {
          return reject(err)
        }

        resolve()
      })
      queue.close = close
    })
  }

  publish (event, callback) {
    this.emitter.emit(event, callback)
  }
}

// One context - and  queue for each subscription
class SubscriptionContext {
  constructor ({ pubsub, fastify }) {
    this.fastify = fastify
    this.pubsub = pubsub
    this.queue = new Readable({
      objectMode: true,
      read: () => {}
    })
  }

  subscribe (topics) {
    if (typeof topics === 'string') {
      return this.pubsub.subscribe(topics, this.queue).then(() => this.queue)
    }
    return Promise.all(topics.map((topic) => this.pubsub.subscribe(topic, this.queue))).then(() => this.queue)
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
    // In rare cases when `subscribe()` not called (e.g. some network error)
    // `close` will be `undefined`.
    if (typeof this.queue.close === 'function') {
      this.queue.close()
    }
    this.queue.destroy()
  }
}

module.exports = {
  PubSub,
  SubscriptionContext
}
