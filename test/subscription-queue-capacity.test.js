'use strict'

const { test } = require('node:test')
const { getEventListeners, once } = require('node:events')
const { setImmediate: immediate } = require('node:timers/promises')
const { Readable, Writable } = require('readable-stream')
const mq = require('mqemitter')
const Fastify = require('fastify')
const WebSocket = require('ws')
const mercurius = require('..')
const SubscriptionQueue = require('../lib/subscription-queue')
const { PubSub, SubscriptionContext } = require('../lib/subscriber')
const common = require('./internals/common')

test('capacity waiting is additive to the Readable queue', async t => {
  const queue = new SubscriptionQueue(2)
  t.assert.ok(queue instanceof Readable)
  t.assert.strictEqual(queue.readableObjectMode, true)
  t.assert.strictEqual(queue.readableHighWaterMark, 2)
  t.assert.strictEqual(await queue.waitForCapacity(), true)
  t.assert.strictEqual(queue.push(1), true)
  t.assert.strictEqual(queue.push(2), false)
  let ready = false
  const capacity = queue.waitForCapacity().then(common.mustCall(t, value => {
    ready = value
  }))
  await immediate()
  t.assert.strictEqual(ready, false)
  t.assert.strictEqual(queue.read(), 1)
  await capacity
  t.assert.strictEqual(ready, true)
  t.assert.strictEqual(queue.readableLength, 1)
  t.assert.strictEqual(queue.read(), 2)
  queue.push(null)
  t.assert.strictEqual(await queue.waitForCapacity(), false)
})

test('the default high water mark and Readable validation are preserved', t => {
  const queue = new SubscriptionQueue()
  t.assert.strictEqual(queue.readableHighWaterMark, new Readable({ objectMode: true, read () {} }).readableHighWaterMark)
  for (const value of [NaN, Infinity, 0.5, -1]) {
    t.assert.throws(() => new SubscriptionQueue(value), { code: 'ERR_INVALID_ARG_VALUE' })
  }
  queue.destroy()
})

test('all waiters wake below the threshold, not while the queue is still full', async t => {
  const queue = new SubscriptionQueue(2)
  for (let i = 0; i < 4; i++) queue.push(i)
  const controller = new AbortController()
  let completions = 0
  const waits = [1, 2].map(() => queue.waitForCapacity({ signal: controller.signal }).then(
    common.mustCall(t, value => { t.assert.strictEqual(value, true); completions++ })
  ))
  queue.read()
  queue.read()
  await immediate()
  t.assert.strictEqual(queue.readableLength, 2)
  t.assert.strictEqual(completions, 0)
  queue.read()
  await Promise.all(waits)
  t.assert.strictEqual(completions, 2)
  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
  queue.destroy()
})

for (const end of ['eof', 'destroy', 'error', 'context']) {
  test(`${end} releases capacity waiters without draining queued events`, async t => {
    const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 1 })
    const queue = sc.queue
    queue.push('buffered')
    const controller = new AbortController()
    const capacity = queue.waitForCapacity({ signal: controller.signal }).then(
      common.mustCall(t, value => t.assert.strictEqual(value, false))
    )
    if (end === 'eof') queue.push(null)
    else if (end === 'context') sc.close()
    else if (end === 'destroy') queue.destroy()
    else {
      queue.once('error', common.mustCall(t, error => t.assert.strictEqual(error.message, 'failure')))
      queue.destroy(new Error('failure'))
    }
    await capacity
    await immediate()
    t.assert.strictEqual(await queue.waitForCapacity(), false)
    t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
    if (end === 'eof' || end === 'context') {
      // EOF retains its normal Readable behavior: buffered events are not lost.
      t.assert.strictEqual(queue.read(), 'buffered')
    }
    queue.destroy()
  })
}

test('returning the async iterator releases a producer waiting for capacity', async t => {
  const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 1 })
  const queue = sc.queue
  queue.push('first')
  const iterator = queue[Symbol.asyncIterator]()
  t.assert.deepStrictEqual(await iterator.next(), { value: 'first', done: false })
  queue.push('second')
  const capacity = queue.waitForCapacity().then(
    common.mustCall(t, value => t.assert.strictEqual(value, false))
  )
  await iterator.return()
  await capacity
  t.assert.strictEqual(queue.destroyed, true)
})

test('cancellation rejects only its waiter and removes the abort listener', async t => {
  const queue = new SubscriptionQueue(1)
  queue.push('event')
  const controller = new AbortController()
  const cancelled = queue.waitForCapacity({ signal: controller.signal })
  let otherReady = false
  const other = queue.waitForCapacity().then(common.mustCall(t, value => { otherReady = value }))
  const error = new Error('cancelled')
  const rejected = t.assert.rejects(cancelled, error)
  controller.abort(error)
  await rejected
  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
  t.assert.strictEqual(otherReady, false)
  t.assert.strictEqual(queue.destroyed, false)
  t.assert.strictEqual(queue.read(), 'event')
  await other
  t.assert.strictEqual(otherReady, true)
  queue.destroy()
})

test('another abort observer cannot prevent waiter cancellation', async t => {
  const queue = new SubscriptionQueue(1)
  queue.push('event')
  const controller = new AbortController()
  controller.signal.addEventListener('abort', event => event.stopImmediatePropagation(), { once: true })
  const capacity = queue.waitForCapacity({ signal: controller.signal })
  controller.abort()
  await t.assert.rejects(capacity, controller.signal.reason)
  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
  queue.destroy()
})

test('an already aborted signal rejects without installing a waiter', async t => {
  const queue = new SubscriptionQueue(1)
  const controller = new AbortController()
  controller.abort()
  await t.assert.rejects(queue.waitForCapacity({ signal: controller.signal }), controller.signal.reason)
  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
  queue.destroy()
})

test('read demand does not report capacity before a synchronous refill', async t => {
  const queue = new SubscriptionQueue(1)
  queue.push('first')
  let refill = true
  queue._read = () => {
    if (refill) { refill = false; queue.push('refill') }
  }
  let ready = false
  const capacity = queue.waitForCapacity().then(common.mustCall(t, value => { ready = value }))
  t.assert.strictEqual(queue.read(), 'first')
  await immediate()
  t.assert.strictEqual(queue.readableLength, 1)
  t.assert.strictEqual(ready, false)
  t.assert.strictEqual(queue.read(), 'refill')
  await capacity
  t.assert.strictEqual(ready, true)
  queue.destroy()
})

test('a custom producer can wait for capacity without losing or duplicating events', async t => {
  const queue = new SubscriptionQueue(2)
  let produced = 0
  const producer = (async () => {
    for (let i = 0; i < 100; i++) {
      produced++
      if (!queue.push(i) && !await queue.waitForCapacity()) return
    }
    queue.push(null)
  })().then(common.mustCall(t, () => {}))
  await immediate()
  t.assert.strictEqual(produced, 2)
  const values = []
  for await (const value of queue) {
    values.push(value)
    t.assert.ok(queue.readableLength <= 2)
  }
  await producer
  t.assert.deepStrictEqual(values, Array.from({ length: 100 }, (_, i) => i))
})

test('pipe and flowing data consumption still release capacity', async t => {
  const queue = new SubscriptionQueue(1)
  queue.push('value')
  const capacity = queue.waitForCapacity().then(common.mustCall(t, value => t.assert.strictEqual(value, true)))
  const sink = new Writable({
    objectMode: true,
    write: common.mustCall(t, (value, encoding, callback) => {
      t.assert.strictEqual(value, 'value')
      callback()
    })
  })
  const finished = once(sink, 'finish')
  queue.pipe(sink)
  await capacity
  queue.push(null)
  await finished
})

function deferred () {
  let done
  const promise = new Promise(resolve => { done = resolve })
  return { promise, resolve: done }
}

for (const protocol of ['graphql-ws', 'graphql-transport-ws']) {
  test(`${protocol}: a custom pubsub uses capacity waiting with real subscription execution`, async t => {
    const app = Fastify()
    const resolving = deferred()
    const release = deferred()
    const completed = deferred()
    let produced = 0
    let queue
    let producer
    let client = null
    t.after(async () => {
      release.resolve()
      queue?.destroy()
      client?.terminate()
      await app.close()
      await producer
    })
    await app.register(mercurius, {
      schema: 'type Query { hello: String } type Subscription { tick: Int! }',
      resolvers: {
        Subscription: {
          tick: {
            subscribe: (_, args, context) => context.pubsub.subscribe('tick'),
            resolve: async payload => {
              if (payload.tick === 0) resolving.resolve()
              await release.promise
              return payload.tick
            }
          }
        }
      },
      subscription: {
        queueHighWaterMark: 2,
        pubsub: {
          async subscribe (topic, q) {
            queue = q
            queue.close = [common.mustCall(t, () => {})]
            // Setup returns immediately; the producer waits independently.
            producer = (async () => {
              for (let i = 0; i < 10; i++) {
                produced++
                if (!queue.push({ tick: i }) && !await queue.waitForCapacity()) return
              }
              queue.push(null)
            })().then(common.mustCall(t, () => {}))
          },
          publish () { t.assert.fail('not used by this source') }
        }
      }
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    client = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/graphql`, protocol)
    await once(client, 'open')
    const ack = once(client, 'message')
    client.send(JSON.stringify({ type: 'connection_init' }))
    const [acknowledgement] = await ack
    t.assert.strictEqual(JSON.parse(acknowledgement).type, 'connection_ack')
    const values = []
    const complete = common.mustCall(t, () => completed.resolve())
    client.on('message', raw => {
      const message = JSON.parse(raw)
      if (message.type === 'complete') return complete()
      t.assert.strictEqual(message.type, protocol === 'graphql-ws' ? 'data' : 'next')
      t.assert.strictEqual(message.id, 'tick')
      t.assert.strictEqual(message.payload.errors, undefined)
      values.push(message.payload.data.tick)
    })
    client.send(JSON.stringify({
      id: 'tick',
      type: protocol === 'graphql-ws' ? 'start' : 'subscribe',
      payload: { query: 'subscription { tick }' }
    }))
    await resolving.promise
    await immediate()
    t.assert.strictEqual(queue.readableLength, 2)
    t.assert.strictEqual(produced, 3, 'two queued events and one already resolving')
    release.resolve()
    await completed.promise
    await producer
    t.assert.deepStrictEqual(values, Array.from({ length: 10 }, (_, i) => i))
  })
}

test('the built-in PubSub retains nonblocking publish and unlimited buffering', async t => {
  const pubsub = new PubSub(mq())
  const sc = new SubscriptionContext({ pubsub, queueHighWaterMark: 1 })
  await sc.subscribe('topic')
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => {
      const result = pubsub.publish({ topic: 'topic', payload: i }, common.mustCall(t, resolve))
      t.assert.strictEqual(result, undefined)
    })
  }
  t.assert.strictEqual(sc.queue.readableLength, 3)
  t.assert.strictEqual(pubsub.publish({ topic: 'topic', payload: 3 }), undefined)
  sc.close()
})
