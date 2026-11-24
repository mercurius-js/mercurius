const { test } = require('node:test')
const { EventEmitter, once } = require('node:events')
const { setImmediate: immediate, setTimeout: sleep } = require('node:timers/promises')
const mq = require('mqemitter')
const Fastify = require('fastify')
const WebSocket = require('ws')
const GQL = require('..')
const { PubSub, SubscriptionContext, SubscriptionQueue } = require('../lib/subscriber')

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
    close = []

    add (value, cb) {
      t.assert.strictEqual(value, 1)
      cb()
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

test('SubscriptionQueue hands an event to the read waiting for it', async (t) => {
  const queue = new SubscriptionQueue()
  t.assert.strictEqual(queue[Symbol.asyncIterator](), queue)
  t.assert.strictEqual(queue.highWaterMark, 16)

  const read = queue.next()
  queue.add('a', () => {})
  t.assert.strictEqual(queue.length, 0)
  t.assert.deepStrictEqual(await read, { value: 'a', done: false })
})

test('SubscriptionQueue push() returns false once it holds highWaterMark events', (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 2 })
  t.assert.strictEqual(queue.push('a'), true)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.strictEqual(queue.push('c'), false)
  t.assert.strictEqual(queue.length, 3)
})

test('SubscriptionQueue push() does not wait with overflow \'wait\'', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 1, overflow: 'wait' })
  t.assert.strictEqual(queue.push('a'), false)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.strictEqual(queue.length, 2)

  // a publisher calling add() waits until both events are read
  let added = false
  queue.add('c', () => { added = true })
  await queue.next()
  t.assert.strictEqual(added, false)
  await queue.next()
  t.assert.strictEqual(added, true)
})

test('SubscriptionQueue waitForRoom() calls back once the queue holds fewer than highWaterMark events', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 2 })
  t.assert.strictEqual(queue.push(0), true)
  t.assert.strictEqual(queue.push(1), false)
  t.assert.strictEqual(queue.push(2), false)

  let room = 0
  queue.waitForRoom(() => room++)
  const promise = queue.waitForRoom()
  await queue.next()
  t.assert.strictEqual(room, 0)
  await queue.next()
  t.assert.strictEqual(room, 1)
  await promise

  // with room, it calls back at once
  queue.waitForRoom(() => room++)
  t.assert.strictEqual(room, 2)
  await queue.waitForRoom()
})

test('SubscriptionQueue waitForRoom() calls back once the queue is closed', async (t) => {
  for (const close of ['end', 'destroy', 'return']) {
    const queue = new SubscriptionQueue({ highWaterMark: 1 })
    queue.push('a')
    let room = false
    queue.waitForRoom(() => { room = true })
    queue[close]()
    t.assert.strictEqual(room, true, close)
    await queue.waitForRoom()
  }
})

test('SubscriptionQueue push() returns false once the queue is closed', (t) => {
  const ended = new SubscriptionQueue()
  ended.end()
  t.assert.strictEqual(ended.push('a'), false)
  t.assert.strictEqual(ended.length, 0)

  const destroyed = new SubscriptionQueue()
  destroyed.destroy()
  t.assert.strictEqual(destroyed.push('a'), false)

  // the push that overflows a queue with overflow 'close' closes it
  const closing = new SubscriptionQueue({ highWaterMark: 1, overflow: 'close' })
  t.assert.strictEqual(closing.push('a'), false)
  t.assert.strictEqual(closing.push('b'), false)
  t.assert.strictEqual(closing.destroyed, true)
  t.assert.strictEqual(closing.push('c'), false)
})

test('SubscriptionQueue keeps its order while a long backlog is read', async (t) => {
  const queue = new SubscriptionQueue()
  for (let i = 0; i < 3000; i++) {
    queue.push(i)
  }
  for (let i = 0; i < 2000; i++) {
    t.assert.strictEqual((await queue.next()).value, i)
  }
  for (let i = 3000; i < 4000; i++) {
    queue.push(i)
  }
  for (let i = 2000; i < 4000; i++) {
    t.assert.strictEqual((await queue.next()).value, i)
  }
  t.assert.strictEqual(queue.length, 0)
})

test('SubscriptionQueue end() lets the events left be read, then is done', async (t) => {
  const queue = new SubscriptionQueue()
  queue.push('a')
  queue.end()
  queue.end()
  let called = false
  queue.add('b', () => { called = true })
  t.assert.strictEqual(called, true)

  t.assert.deepStrictEqual(await queue.next(), { value: 'a', done: false })
  t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })

  const waiting = new SubscriptionQueue()
  const read = waiting.next()
  waiting.end()
  t.assert.deepStrictEqual(await read, { value: undefined, done: true })
})

test('SubscriptionQueue return() drops the events and is done', async (t) => {
  const queue = new SubscriptionQueue()
  queue.push('a')
  t.assert.deepStrictEqual(await queue.return(), { value: undefined, done: true })
  t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })
  queue.destroy()
  t.assert.strictEqual(queue.length, 0)
})

test('SubscriptionQueue destroy() with an error rejects the next read once', async (t) => {
  const error = new Error('kaboom')

  const queue = new SubscriptionQueue()
  queue.push('a')
  queue.destroy(error)
  await t.assert.rejects(queue.next(), error)
  t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })

  const waiting = new SubscriptionQueue()
  const first = waiting.next()
  const second = waiting.next()
  waiting.destroy(error)
  await t.assert.rejects(first, error)
  t.assert.deepStrictEqual(await second, { value: undefined, done: true })
})

test('SubscriptionQueue with overflow \'close\' and no logger ends with an error', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 1, overflow: 'close' })
  queue.push('a')
  queue.push('b')
  await t.assert.rejects(queue.next(), { code: 'MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL' })
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

  const published = publishAll(sc, 4)
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2, 3])
  t.assert.strictEqual(queue.length, 4)
  for (let i = 0; i < 4; i++) {
    t.assert.deepStrictEqual(await queue.next(), { value: i, done: false })
  }
})

test('with queueOverflow \'wait\', publishing to a full subscription queue waits until the subscription reads from it', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 2, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')

  const published = publishAll(sc, 4)
  await immediate()
  // the queue holds two events: the publishers of the next ones wait
  t.assert.deepStrictEqual(published, [0, 1])

  // each event read lets one more publisher go on
  t.assert.deepStrictEqual(await queue.next(), { value: 0, done: false })
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2])

  t.assert.deepStrictEqual(await queue.next(), { value: 1, done: false })
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2, 3])
  t.assert.deepStrictEqual(await queue.next(), { value: 2, done: false })
  t.assert.deepStrictEqual(await queue.next(), { value: 3, done: false })
})

test('closing a subscription lets the publishers waiting for its queue go on', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 1, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')

  const published = publishAll(sc, 3)
  await immediate()
  t.assert.deepStrictEqual(published, [0])

  sc.close()
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2])
  // the events left are still read
  t.assert.deepStrictEqual(await queue.next(), { value: 0, done: false })
  t.assert.deepStrictEqual(await queue.next(), { value: 1, done: false })
  t.assert.deepStrictEqual(await queue.next(), { value: 2, done: false })
  t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })
})

test('destroying a subscription queue lets the publishers waiting for it go on', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 1, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')

  const published = publishAll(sc, 3)
  await immediate()
  t.assert.deepStrictEqual(published, [0])

  // what the iterator return() of a stopped subscription does
  queue.destroy()
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2])
  t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })
})

test('with queueOverflow \'drop\', a full subscription queue discards the new events', async (t) => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 2, queueOverflow: 'drop' })
  const queue = await sc.subscribe('TOPIC')
  const events = queue[Symbol.asyncIterator]()

  const published = publishAll(sc, 4)
  await immediate()
  t.assert.deepStrictEqual(published, [0, 1, 2, 3])
  t.assert.strictEqual(queue.length, 2)

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

test('a custom pubsub can push bursts of events, and wait for room once the queue is full', async (t) => {
  let produced = 0
  class CustomPubSub {
    async subscribe (topic, queue) {
      const produce = async () => {
        for (let i = 0; i < 10; i++) {
          produced++
          if (!queue.push(i)) {
            await queue.waitForRoom()
          }
        }
      }
      produce()
    }
  }
  const sc = new SubscriptionContext({ pubsub: new CustomPubSub(), queueHighWaterMark: 4 })
  const queue = await sc.subscribe('TOPIC')

  await immediate()
  // the burst stops once the queue is full
  t.assert.strictEqual(produced, 4)
  t.assert.strictEqual(queue.length, 4)

  for (let i = 0; i < 10; i++) {
    t.assert.deepStrictEqual(await queue.next(), { value: i, done: false })
    t.assert.ok(queue.length <= 4)
  }
  t.assert.strictEqual(produced, 10)
  sc.close()
})

test('a custom pubsub can push to the queue and set its close function', async (t) => {
  const emitter = new EventEmitter()
  class CustomPubSub {
    async subscribe (topic, queue) {
      const listener = (payload) => t.assert.strictEqual(queue.push(payload), queue.length < queue.highWaterMark)
      emitter.on(topic, listener)
      queue.close = () => emitter.removeListener(topic, listener)
    }
  }
  const sc = new SubscriptionContext({ pubsub: new CustomPubSub(), queueHighWaterMark: 2 })
  const queue = await sc.subscribe('TOPIC')

  emitter.emit('TOPIC', 0)
  emitter.emit('TOPIC', 1)
  emitter.emit('TOPIC', 2)
  t.assert.strictEqual(queue.length, 3)

  sc.close()
  t.assert.strictEqual(emitter.listenerCount('TOPIC'), 0)
})

test('publish without a callback resolves once the event is delivered', async (t) => {
  const pubsub = new PubSub(mq())
  const sc = new SubscriptionContext({ pubsub, queueHighWaterMark: 1, queueOverflow: 'wait' })
  const queue = await sc.subscribe('TOPIC')

  await pubsub.publish({ topic: 'TOPIC', payload: 0 })

  let delivered = false
  pubsub.publish({ topic: 'TOPIC', payload: 1 }).then(() => { delivered = true })
  await immediate()
  // the queue is full
  t.assert.strictEqual(delivered, false)

  t.assert.deepStrictEqual(await queue.next(), { value: 0, done: false })
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
  // published faster than the subscription can send them: the first one goes
  // to the subscription waiting for it, the next two fill the queue
  for (let i = 0; i < 4; i++) {
    app.graphql.pubsub.publish({ topic: 'TICK', payload: { onTick: i } })
  }
  await sleep(100)

  t.assert.deepStrictEqual(messages, [{
    type: 'next',
    id: '1',
    payload: { data: { onTick: 0 } }
  }, {
    type: 'error',
    id: '1',
    payload: [{ message: 'Subscription closed: its queue is full' }]
  }])
  t.assert.deepStrictEqual(removeListener.calls.map(([topic]) => topic), ['TICK'])

  ws.send(JSON.stringify({ id: '2', type: 'subscribe', payload: { query: 'subscription { onTick }' } }))
  await sleep(100)
  await app.graphql.pubsub.publish({ topic: 'TICK', payload: { onTick: 3 } })
  await sleep(100)
  t.assert.deepStrictEqual(messages.slice(2), [{ type: 'next', id: '2', payload: { data: { onTick: 3 } } }])
})
