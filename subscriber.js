const { Readable } = require('readable-stream')

class PubSub {
  constructor (emitter) {
    this.emitter = emitter
  }

  subscribe (topic, queue) {
    function listener (value, cb) {
      queue.push(value.payload)
      cb()
    }

    const close = () => {
      this.emitter.removeListener(topic, listener)
    }

    this.emitter.on(topic, listener)
    queue.close = close
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

  subscribe (topic) {
    this.pubsub.subscribe(topic, this.queue)

    return this.queue
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
      this.fastify.log(err)
    })
  }

  close () {
    this.queue.close()
    this.queue.destroy()
  }
}

module.exports = {
  PubSub,
  SubscriptionContext
}
