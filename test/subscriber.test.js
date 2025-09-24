const { test } = require('node:test')
const mq = require('mqemitter')
const { PubSub, SubscriptionContext } = require('../lib/subscriber')

function capture (obj, methodName) {
  const original = obj[methodName]
  const calls = []

  obj[methodName] = function (...args) {
    calls.push(args)
    if (typeof original === 'function') {
      return original.apply(this, args)
    }
  }

  obj[methodName].calls = calls
  return obj[methodName]
}

test('subscriber published an event', async (t) => {
  class MyQueue {
    push (value) {
      t.assert.strictEqual(value, 1)
    }
  }

  const s = new PubSub(mq())
  s.subscribe('TOPIC', new MyQueue())
  s.publish({
    topic: 'TOPIC',
    payload: 1
  }, () => {
    t.assert.ok('passed')
  })
})

test('subscription context not throw error on close', t => {
  t.plan(1)
  const pubsub = new PubSub(mq())

  const sc = new SubscriptionContext({ pubsub })

  sc.close()
  t.assert.ok('passed')
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
    t.assert.ok('passed')
  })
})

test('subscription context publish event errs, error is catched', t => {
  t.plan(1)
  const emitter = mq()
  const pubsub = new PubSub(emitter)

  const fastifyMock = {
    log: {
      error () {
        t.assert.ok('passed')
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
  const emitter = mq()
  const error = new Error('Dummy error')
  emitter.on = (topic, listener, done) => done(error)

  const pubsub = new PubSub(emitter)
  const sc = new SubscriptionContext({ pubsub })

  await t.assert.rejects(sc.subscribe('TOPIC'), error)
})

test('subscription context can handle multiple topics', async (t) => {
  const q = mq()
  const pubsub = new PubSub(q)
  const sc = new SubscriptionContext({ pubsub })

  sc.subscribe(['TOPIC1', 'TOPIC2'])
  await sc.publish({
    topic: 'TOPIC1',
    payload: 1
  })
  await sc.publish({
    topic: 'TOPIC2',
    payload: 2
  })

  t.assert.strictEqual(q._matcher._trie.size, 2, 'Two listeners not found')
  sc.close()
  setImmediate(() => { t.assert.strictEqual(q._matcher._trie.size, 0, 'All listeners not removed') })
})

test('subscription context should not call removeListener more than one time when close called multiple times', async t => {
  const q = mq()
  const removeListener = capture(q, 'removeListener')
  const pubsub = new PubSub(q)
  const sc = new SubscriptionContext({ pubsub })
  await sc.subscribe('foo')
  sc.close()
  sc.close()
  t.assert.strictEqual(removeListener.calls.length, 1)
})
