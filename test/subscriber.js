const { test } = require('tap')
const mq = require('mqemitter')
const Subscriber = require('../subscriber')

test('creates only one new queue for a topic', async (t) => {
  const s = new Subscriber(mq())

  t.equal(s._queues.size, 0)
  s.subscribe('TOPIC')
  t.equal(s._queues.size, 1)
  s.subscribe('TOPIC')
  t.equal(s._queues.size, 1)
})

test('when closing the subscriber the listeners are removed', async (t) => {
  const emitter = mq()
  emitter.removeListener = (topic, notify, done) => {
    t.pass()
  }
  const s = new Subscriber(emitter)

  s.subscribe('TOPIC')
  s.close()
})

test('subscriber published an event', async (t) => {
  const s = new Subscriber(mq())
  s.subscribe('TOPIC')
  s.publish({
    topic: 'TOPIC',
    payload: 1
  }, () => {
    t.pass()
  })
})
