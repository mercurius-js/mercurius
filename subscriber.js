const { Readable } = require('stream')

module.exports = class Subscriber {
  constructor (emitter) {
    this.emitter = emitter
    this._queues = new Map()
    this._listeners = new Map()
  }

  _listen (event) {
    if (this._listeners.has(event)) {
      return
    }

    const listener = (message, callback) => {
      const { topic, payload } = message
      const queues = this._queues.get(topic)

      if (!queues) {
        return
      }

      for (const queue of queues) {
        queue.push(payload)
      }

      if (callback) {
        callback()
      }
    }

    this.emitter.on(event, listener)
    this._listeners.set(event, listener)
  }

  /**
   * @topic: string representing the subscription topic
   */
  subscribe (topic) {
    let eventQueues = this._queues.get(topic)

    if (!eventQueues) {
      eventQueues = new Set()
      this._queues.set(topic, eventQueues)
    }

    this._listen(topic)
    const queue = new Readable({
      objectMode: true,
      read: () => {}
    })

    eventQueues.add(queue)
    return {
      close: () => {
        const innerQueues = this._queues.get(topic)
        if (!innerQueues) return

        innerQueues.delete(queue)

        if (!innerQueues.size) {
          this._queues.delete(topic)
        }
      },
      iterator: queue
    }
  }

  close () {
    this._listeners.forEach((fn, event) => {
      this.emitter.removeListener(event, fn)
    })
  }
}
