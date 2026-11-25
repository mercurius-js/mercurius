'use strict'

const { test } = require('node:test')
const SubscriptionQueue = require('../lib/subscription-queue')

test('SubscriptionQueue hands an event to the read waiting for it', async (t) => {
  const queue = new SubscriptionQueue()
  t.assert.strictEqual(queue[Symbol.asyncIterator](), queue)
  t.assert.strictEqual(queue.highWaterMark, 16)
  t.assert.strictEqual(queue.overflow, 'buffer')

  const read = queue.next()
  t.assert.strictEqual(queue.push('a'), true)
  t.assert.strictEqual(queue.length, 0)
  t.assert.deepStrictEqual(await read, { value: 'a', done: false })
})

test('SubscriptionQueue push() keeps the event, and returns false once the queue holds highWaterMark events', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 2 })
  t.assert.strictEqual(queue.push('a'), true)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.strictEqual(queue.push('c'), false)
  t.assert.strictEqual(queue.length, 3)
  for (const value of ['a', 'b', 'c']) {
    t.assert.deepStrictEqual(await queue.next(), { value, done: false })
  }
})

test('SubscriptionQueue with overflow \'wait\' keeps the events pushed to a full queue', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 1, overflow: 'wait' })
  t.assert.strictEqual(queue.overflow, 'wait')
  t.assert.strictEqual(queue.push('a'), false)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.strictEqual(queue.length, 2)

  let ready
  queue.waitForCapacity().then((value) => { ready = value })
  t.assert.deepStrictEqual(await queue.next(), { value: 'a', done: false })
  t.assert.strictEqual(ready, undefined)
  t.assert.deepStrictEqual(await queue.next(), { value: 'b', done: false })
  t.assert.strictEqual(ready, true)
})

test('SubscriptionQueue with overflow \'drop\' discards the events pushed to a full queue', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 2, overflow: 'drop' })
  t.assert.strictEqual(queue.push('a'), true)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.strictEqual(queue.push('c'), false)
  t.assert.strictEqual(queue.length, 2)
  t.assert.deepStrictEqual(await queue.next(), { value: 'a', done: false })
  t.assert.strictEqual(queue.push('d'), false)
  t.assert.deepStrictEqual(await queue.next(), { value: 'b', done: false })
  t.assert.deepStrictEqual(await queue.next(), { value: 'd', done: false })
})

test('SubscriptionQueue with overflow \'close\' ends with an error once an event is pushed to a full queue', async (t) => {
  const warnings = []
  const queue = new SubscriptionQueue({ highWaterMark: 1, overflow: 'close', log: { warn: (msg) => warnings.push(msg) } })
  t.assert.strictEqual(queue.push('a'), false)
  t.assert.deepStrictEqual(warnings, [])
  let ready
  queue.waitForCapacity().then((value) => { ready = value })

  t.assert.strictEqual(queue.push('b'), false)
  // its events are dropped, and the producers waiting for it go on
  t.assert.strictEqual(queue.length, 0)
  t.assert.strictEqual(queue.push('c'), false)
  t.assert.deepStrictEqual(warnings, ['subscription closed: its client does not read its events fast enough'])
  await t.assert.rejects(queue.next(), { code: 'MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL' })
  t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })
  t.assert.strictEqual(ready, false)
})

test('SubscriptionQueue with overflow \'close\' and no logger ends with an error', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 1, overflow: 'close' })
  queue.push('a')
  queue.push('b')
  await t.assert.rejects(queue.next(), { code: 'MER_ERR_GQL_SUBSCRIPTION_QUEUE_FULL' })
})

test('SubscriptionQueue push() returns false and drops the event once the queue is closed', (t) => {
  const ended = new SubscriptionQueue()
  ended.end()
  t.assert.strictEqual(ended.push('a'), false)
  t.assert.strictEqual(ended.length, 0)

  const destroyed = new SubscriptionQueue()
  destroyed.destroy()
  t.assert.strictEqual(destroyed.push('a'), false)
  t.assert.strictEqual(destroyed.length, 0)
})

test('SubscriptionQueue push(null) ends the queue, as it ended a Readable', async (t) => {
  const queue = new SubscriptionQueue()
  queue.push('a')
  t.assert.strictEqual(queue.push(null), false)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.deepStrictEqual(await queue.next(), { value: 'a', done: false })
  t.assert.deepStrictEqual(await queue.next(), { value: undefined, done: true })
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
