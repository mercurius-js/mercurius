const { test } = require('node:test')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { setImmediate: immediate, setTimeout: sleep } = require('node:timers/promises')
const mq = require('mqemitter')
const Fastify = require('fastify')
const WebSocket = require('ws')
const GQL = require('..')
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

test('in-flight message delivered after close does not crash the process', async t => {
  t.plan(1)
  // Models an emitter with asynchronous delivery (e.g. mqemitter-redis): a
  // message already read from the network is still delivered to listeners
  // that were matched before removeListener ran.
  const listeners = new Map()
  const emitter = {
    on (topic, listener, done) {
      listeners.set(listener, topic)
      done()
    },
    removeListener (topic, listener) {
      listeners.delete(listener)
    },
    emit (event, cb) {
      const matched = [...listeners.keys()]
      setImmediate(() => {
        for (const listener of matched) {
          listener(event, () => {})
        }
        cb()
      })
    }
  }

  const pubsub = new PubSub(emitter)
  const sc = new SubscriptionContext({ pubsub })

  await sc.subscribe('TOPIC')

  // The message is in flight before the client goes away...
  const delivered = new Promise(resolve => {
    emitter.emit({ topic: 'TOPIC', payload: 1 }, resolve)
  })

  // ...and the subscription closes (queue ends) before it is delivered.
  sc.close()

  await delivered
  t.assert.ok('in-flight message after close did not throw')
})

test('message delivered to a destroyed queue is dropped', async t => {
  t.plan(1)
  const pubsub = new PubSub(mq())
  const sc = new SubscriptionContext({ pubsub })

  await sc.subscribe('TOPIC')
  sc.queue.destroy()

  await sc.publish({
    topic: 'TOPIC',
    payload: 1
  })
  t.assert.ok('message to destroyed queue did not throw')
})

test('subscription queue error is logged, not fatal', t => {
  t.plan(1)
  const pubsub = new PubSub(mq())

  const fastifyMock = {
    log: {
      error () {
        t.assert.ok('error was logged')
      }
    }
  }
  const sc = new SubscriptionContext({ pubsub, fastify: fastifyMock })

  sc.queue.emit('error', new Error('Dummy error'))
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

function publishAll (sc, count) {
  const published = []
  for (let i = 0; i < count; i++) {
    sc.publish({ topic: 'TOPIC', payload: i }).then(() => published.push(i))
  }
  return published
}

test('by default, a full subscription queue keeps the events and publishing does not wait', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 2 })
  const queue = await sc.subscribe('TOPIC')
  const events = queue[Symbol.asyncIterator]()

  const published = publishAll(sc, 4)
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2, 3])
  // the events past the highWaterMark wait in the writable buffer
  t.assert.strictEqual(queue.readableLength, 2)
  for (let i = 0; i < 4; i++) {
    t.assert.deepStrictEqual(await events.next(), { value: i, done: false })
  }
})

test('with queueOverflow \'wait\', publishing to a full subscription queue waits until the subscription reads from it', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 2, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')
  const events = queue[Symbol.asyncIterator]()

  const published = publishAll(sc, 3)
  await immediate()
  // the second event fills the queue
  t.assert.deepStrictEqual(published, [0])

  // each event read lets one more publisher go on
  t.assert.deepStrictEqual(await events.next(), { value: 0, done: false })
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1])

  t.assert.deepStrictEqual(await events.next(), { value: 1, done: false })
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2])
  t.assert.deepStrictEqual(await events.next(), { value: 2, done: false })
})

test('ending a subscription as its connection does lets the publishers waiting for its queue go on', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 1, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')
  const events = queue[Symbol.asyncIterator]()

  const published = publishAll(sc, 4)
  t.assert.deepStrictEqual(await events.next(), { value: 0, done: false })
  await immediate()
  t.assert.deepStrictEqual(published, [0])

  // what handleGQLComplete() does
  sc.close()
  await events.return()
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2, 3])
  t.assert.strictEqual(queue.destroyed, true)
})

test('destroying a subscription queue lets the publishers waiting for it go on', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 1, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')

  const published = publishAll(sc, 3)
  await immediate()
  t.assert.deepStrictEqual(published, [])

  queue.destroy()
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2])
})

test('with queueOverflow \'drop\', a full subscription queue discards the new events', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 2, queueOverflow: 'drop' })
  const queue = await sc.subscribe('TOPIC')
  const events = queue[Symbol.asyncIterator]()

  const published = publishAll(sc, 4)
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2, 3])
  t.assert.strictEqual(queue.readableLength, 2)

  t.assert.deepStrictEqual(await events.next(), { value: 0, done: false })
  t.assert.deepStrictEqual(await events.next(), { value: 1, done: false })
  await sc.publish({ topic: 'TOPIC', payload: 4 })
  t.assert.deepStrictEqual(await events.next(), { value: 4, done: false })
})

test('with queueOverflow \'close\', a full subscription queue ends the subscription with an error', async (t) => {
  const warnings = []
  const fastify = { log: { warn: (msg) => warnings.push(msg), error: () => t.assert.fail('logged an error') } }
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), fastify, queueHighWaterMark: 2, queueOverflow: 'close' })
  const queue = await sc.subscribe('TOPIC')
  const events = queue[Symbol.asyncIterator]()

  const published = publishAll(sc, 4)
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2, 3])
  t.assert.strictEqual(queue.destroyed, true)

  await t.assert.rejects(events.next(), { code: 'MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL' })
  t.assert.deepStrictEqual(warnings, ['subscription closed: its client does not read its events fast enough'])
})

test('publishing to a full queue that is not a subscription queue does not wait', async (t) => {
  const pubsub = new PubSub(mq())
  const queue = new Readable({ objectMode: true, highWaterMark: 1, read () {} })
  await pubsub.subscribe('TOPIC', queue)

  const published = []
  for (let i = 0; i < 3; i++) {
    pubsub.publish({ topic: 'TOPIC', payload: i }, () => published.push(i))
  }
  t.assert.deepStrictEqual(published, [0, 1, 2])
  t.assert.strictEqual(queue.readableLength, 3)
})

test('publish without a callback resolves once the event is delivered', async (t) => {
  const pubsub = new PubSub(mq())
  const sc = new SubscriptionContext({ pubsub, queueHighWaterMark: 1, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')
  const events = queue[Symbol.asyncIterator]()

  let delivered = false
  pubsub.publish({ topic: 'TOPIC', payload: 0 }).then(() => { delivered = true })
  await immediate()
  // the event fills the queue
  t.assert.strictEqual(delivered, false)

  t.assert.deepStrictEqual(await events.next(), { value: 0, done: false })
  await immediate()
  t.assert.strictEqual(delivered, true)
})

test('publish without a callback does not reject when the emitter fails', async (t) => {
  const emitter = mq()
  await new Promise((resolve) => emitter.close(resolve))
  const pubsub = new PubSub(emitter)

  t.assert.strictEqual(await pubsub.publish({ topic: 'TOPIC', payload: 1 }), undefined)

  // the callback gets the error
  let error
  t.assert.strictEqual(pubsub.publish({ topic: 'TOPIC', payload: 1 }, (err) => { error = err }), undefined)
  t.assert.strictEqual(error.message, 'mqemitter is closed')
})

// A subscription with queueOverflow 'wait' whose client has stopped reading,
// and a mutation publishing to it that waits.
async function setupWaitingMutation (t) {
  const PAYLOAD = 'a'.repeat(128 * 1024)
  const app = Fastify()
  app.register(GQL, {
    schema: `
      type Query {
        _placeholder: String
      }
      type Mutation {
        tick(n: Int): Boolean
      }
      type Subscription {
        onTick: String
      }
    `,
    resolvers: {
      Mutation: {
        tick: async (_, { n }, { pubsub }) => {
          await pubsub.publish({ topic: 'TICK', payload: { onTick: `${n}:${PAYLOAD}` } })
          return true
        }
      },
      Subscription: {
        onTick: {
          subscribe: (root, args, { pubsub }) => pubsub.subscribe('TICK')
        }
      }
    },
    subscription: { queueOverflow: 'wait' }
  })
  await app.listen({ port: 0, host: '127.0.0.1' })

  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/graphql`, 'graphql-transport-ws')
  t.after(async () => {
    ws.terminate()
    await app.close()
  })
  await once(ws, 'open')
  ws.send(JSON.stringify({ type: 'connection_init' }))
  await once(ws, 'message')
  ws.send(JSON.stringify({ id: '1', type: 'subscribe', payload: { query: 'subscription { onTick }' } }))
  await sleep(100)
  ws.pause()

  // the kernel socket buffers and the subscription queue fill up, then a
  // mutation waits
  let pending = null
  let published = 0
  while (published < 500) {
    const mutation = app.inject({
      method: 'POST',
      url: '/graphql',
      body: { query: `mutation { tick(n: ${published}) }` }
    })
    const waited = await Promise.race([mutation.then(() => false), sleep(100, true)])
    if (waited) {
      pending = mutation
      break
    }
    published++
  }
  t.assert.ok(pending, `${published} mutations published without waiting`)

  return { ws, pending, published }
}

test('with queueOverflow \'wait\', a mutation publishing to a subscription whose client does not read waits for it', async (t) => {
  const { ws, pending, published } = await setupWaitingMutation(t)

  const received = []
  ws.on('message', (data) => {
    received.push(Number(JSON.parse(data).payload.data.onTick.split(':')[0]))
  })
  ws.resume()
  t.assert.deepStrictEqual((await pending).json(), { data: { tick: true } })

  for (let i = 0; i < 50 && received.length <= published; i++) {
    await sleep(20)
  }
  t.assert.deepStrictEqual(received, Array.from({ length: published + 1 }, (_, i) => i))
})

test('with queueOverflow \'wait\', a mutation waiting for a subscription goes on when its client stops it', async (t) => {
  const { ws, pending } = await setupWaitingMutation(t)

  // the client still writes while it does not read
  ws.send(JSON.stringify({ id: '1', type: 'complete' }))
  t.assert.deepStrictEqual((await pending).json(), { data: { tick: true } })
})

test('with queueOverflow \'close\', a subscription whose queue overflows gets an error and can be subscribed again', async (t) => {
  const emitter = mq()
  const removeListener = capture(emitter, 'removeListener')
  const app = Fastify()
  app.register(GQL, {
    schema: `
      type Query {
        _placeholder: String
      }
      type Subscription {
        onTick: Int
      }
    `,
    resolvers: {
      Subscription: {
        onTick: {
          subscribe: (root, args, { pubsub }) => pubsub.subscribe('TICK')
        }
      }
    },
    subscription: { emitter, queueHighWaterMark: 2, queueOverflow: 'close' }
  })
  await app.listen({ port: 0, host: '127.0.0.1' })

  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/graphql`, 'graphql-transport-ws')
  t.after(async () => {
    ws.terminate()
    await app.close()
  })
  await once(ws, 'open')
  ws.send(JSON.stringify({ type: 'connection_init' }))
  await once(ws, 'message')
  const messages = []
  ws.on('message', (data) => messages.push(JSON.parse(data)))

  ws.send(JSON.stringify({ id: '1', type: 'subscribe', payload: { query: 'subscription { onTick }' } }))
  await sleep(100)
  // published faster than the subscription can send them
  for (let i = 0; i < 3; i++) {
    app.graphql.pubsub.publish({ topic: 'TICK', payload: { onTick: i } })
  }
  await sleep(100)

  t.assert.deepStrictEqual(messages, [{
    type: 'error',
    id: '1',
    payload: [{ message: 'Subscription closed: its queue is full' }]
  }])
  t.assert.deepStrictEqual(removeListener.calls.map(([topic]) => topic), ['TICK'])

  ws.send(JSON.stringify({ id: '2', type: 'subscribe', payload: { query: 'subscription { onTick }' } }))
  await sleep(100)
  await app.graphql.pubsub.publish({ topic: 'TICK', payload: { onTick: 3 } })
  await sleep(100)
  t.assert.deepStrictEqual(messages.slice(1), [{ type: 'next', id: '2', payload: { data: { onTick: 3 } } }])
})
