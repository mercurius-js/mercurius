'use strict'

const { test } = require('node:test')
const { getEventListeners, once } = require('node:events')
const { setImmediate: immediate } = require('node:timers/promises')
const mq = require('mqemitter')
const Fastify = require('fastify')
const WebSocket = require('ws')
const mercurius = require('..')
const SubscriptionQueue = require('../lib/subscription-queue')
const { PubSub, SubscriptionContext } = require('../lib/subscriber')
const common = require('./internals/common')

test('capacity is waited for until a read brings the queue below its high water mark', async t => {
  const queue = new SubscriptionQueue({ highWaterMark: 2 })
  t.assert.strictEqual(queue.highWaterMark, 2)
  t.assert.strictEqual(await queue.waitForCapacity(), true)
  t.assert.strictEqual(queue.push(1), true)
  t.assert.strictEqual(queue.push(2), false)
  let ready = false
  const capacity = queue.waitForCapacity().then(common.mustCall(t, value => {
    ready = value
  }))
  await immediate()
  t.assert.strictEqual(ready, false)
  t.assert.deepStrictEqual(await queue.next(), { value: 1, done: false })
  await capacity
  t.assert.strictEqual(ready, true)
  t.assert.strictEqual(queue.length, 1)
  t.assert.deepStrictEqual(await queue.next(), { value: 2, done: false })
  queue.end()
  t.assert.strictEqual(await queue.waitForCapacity(), false)
})

test('all waiters wake below the threshold, not while the queue is still full', async t => {
  const queue = new SubscriptionQueue({ highWaterMark: 2 })
  for (let i = 0; i < 4; i++) queue.push(i)
  const controller = new AbortController()
  let completions = 0
  const waits = [1, 2].map(() => queue.waitForCapacity({ signal: controller.signal }).then(
    common.mustCall(t, value => { t.assert.strictEqual(value, true); completions++ })
  ))
  await queue.next()
  await queue.next()
  await immediate()
  t.assert.strictEqual(queue.length, 2)
  t.assert.strictEqual(completions, 0)
  await queue.next()
  await Promise.all(waits)
  t.assert.strictEqual(completions, 2)
  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
  queue.destroy()
})

for (const end of ['end', 'push(null)', 'destroy', 'error', 'context']) {
  test(`${end} releases capacity waiters without draining queued events`, async t => {
    const sc = new SubscriptionContext({ pubsub: new PubSub(mq()), queueHighWaterMark: 1 })
    const queue = sc.queue
    queue.push('buffered')
    const controller = new AbortController()
    const capacity = queue.waitForCapacity({ signal: controller.signal }).then(
      common.mustCall(t, value => t.assert.strictEqual(value, false))
    )
    if (end === 'end') queue.end()
    else if (end === 'push(null)') queue.push(null)
    else if (end === 'context') sc.close()
    else if (end === 'destroy') queue.destroy()
    else queue.destroy(new Error('failure'))
    await capacity
    await immediate()
    t.assert.strictEqual(await queue.waitForCapacity(), false)
    t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
    if (end === 'error') {
      await t.assert.rejects(queue.next(), { message: 'failure' })
    } else if (end !== 'destroy') {
      // ending the queue does not lose the events it holds
      t.assert.deepStrictEqual(await queue.next(), { value: 'buffered', done: false })
    }
    t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })
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
  t.assert.strictEqual(queue.length, 0)
  t.assert.strictEqual(queue.push('third'), false)
})

test('cancellation rejects only its waiter and removes the abort listener', async t => {
  const queue = new SubscriptionQueue({ highWaterMark: 1 })
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
  // the queue is still open
  t.assert.deepStrictEqual(await queue.next(), { value: 'event', done: false })
  await other
  t.assert.strictEqual(otherReady, true)
  t.assert.strictEqual(await queue.waitForCapacity(), true)
  queue.destroy()
})

test('another abort observer cannot prevent waiter cancellation', async t => {
  const queue = new SubscriptionQueue({ highWaterMark: 1 })
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
  const queue = new SubscriptionQueue({ highWaterMark: 1 })
  const controller = new AbortController()
  controller.abort()
  await t.assert.rejects(queue.waitForCapacity({ signal: controller.signal }), controller.signal.reason)
  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
  queue.destroy()
})

test('a custom producer can wait for capacity without losing or duplicating events', async t => {
  const queue = new SubscriptionQueue({ highWaterMark: 2 })
  let produced = 0
  const producer = (async () => {
    for (let i = 0; i < 100; i++) {
      produced++
      if (!queue.push(i) && !await queue.waitForCapacity()) return
    }
    queue.end()
  })().then(common.mustCall(t, () => {}))
  await immediate()
  t.assert.strictEqual(produced, 2)
  const values = []
  for await (const value of queue) {
    values.push(value)
    t.assert.ok(queue.length <= 2)
  }
  await producer
  t.assert.deepStrictEqual(values, Array.from({ length: 100 }, (_, i) => i))
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
              queue.end()
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
    t.assert.strictEqual(queue.length, 2)
    t.assert.strictEqual(produced, 3, 'two queued events and one already resolving')
    release.resolve()
    await completed.promise
    await producer
    t.assert.deepStrictEqual(values, Array.from({ length: 10 }, (_, i) => i))
  })
}

test('by default, the built-in PubSub retains nonblocking publish and unlimited buffering', async t => {
  const pubsub = new PubSub(mq())
  const sc = new SubscriptionContext({ pubsub, queueHighWaterMark: 1 })
  await sc.subscribe('topic')
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => {
      const result = pubsub.publish({ topic: 'topic', payload: i }, common.mustCall(t, resolve))
      t.assert.strictEqual(result, undefined)
    })
  }
  t.assert.strictEqual(sc.queue.length, 3)
  // without a callback, publish() returns a promise, resolved at once
  await pubsub.publish({ topic: 'topic', payload: 3 })
  t.assert.strictEqual(sc.queue.length, 4)
  sc.close()
})
