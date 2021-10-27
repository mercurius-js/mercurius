const { test } = require('tap')
const mq = require('mqemitter')
const { PubSub, SubscriptionContext } = require('../lib/subscriber')

test('subscriber published an event', async (t) => {
  class MyQueue {
    push (value) {
      t.equal(value, 1)
    }
  }

  const s = new PubSub(mq())
  s.subscribe('TOPIC', new MyQueue())
  s.publish({
    topic: 'TOPIC',
    payload: 1
  }, () => {
    t.pass()
  })
})

test('subscription context not throw error on close', t => {
  t.plan(1)
  const pubsub = new PubSub(mq())

  const sc = new SubscriptionContext({ pubsub })

  sc.close()
  t.pass()
})

test('subscription context publish event returns a promise', t => {
  t.plan(1)
  const pubsub = new PubSub(mq())

  const sc = new SubscriptionContext({ pubsub })

  sc.subscribe('TOPIC')
  sc.publish({
    topic: 'TOPIC',
    payload: 1
  }).then(() => {
    t.pass()
  })
})

test('subscription context publish event errs, error is catched', t => {
  t.plan(1)
  const emitter = mq()
  const pubsub = new PubSub(emitter)

  const fastifyMock = {
    log: {
      error () {
        t.pass()
      }
    }
  }
  const sc = new SubscriptionContext({ pubsub, fastify: fastifyMock })

  sc.subscribe('TOPIC')
  emitter.close(() => {})
  sc.publish({
    topic: 'TOPIC',
    payload: 1
  })
})

test('subscription context publish event returns a promise reject on error', async t => {
  t.plan(1)
  const emitter = mq()
  const error = new Error('Dummy error')
  emitter.on = (topic, listener, done) => done(error)

  const pubsub = new PubSub(emitter)
  const sc = new SubscriptionContext({ pubsub })

  try {
    await sc.subscribe('TOPIC')
  } catch (e) {
    t.same(error, e)
  }
})

test('subscription context can handle multiple topics', t => {
  t.plan(2)

  const pubsub = new PubSub(mq())
  const sc = new SubscriptionContext({ pubsub })

  sc.subscribe(['TOPIC1', 'TOPIC2'])
  sc.publish({
    topic: 'TOPIC1',
    payload: 1
  }).then(() => {
    t.pass()
  })
  sc.publish({
    topic: 'TOPIC2',
    payload: 2
  }).then(() => {
    t.pass()
  })
})
