'use strict'

const { test } = require('node:test')
const { SubscriptionQueue } = require('../lib/subscription-queue')

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

test('SubscriptionQueue push() returns false once it holds highWaterMark events', (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 2 })
  t.assert.strictEqual(queue.push('a'), true)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.strictEqual(queue.push('c'), false)
  t.assert.strictEqual(queue.length, 3)
})

test('SubscriptionQueue with overflow \'wait\' keeps the events pushed to a full queue', async (t) => {
  const queue = new SubscriptionQueue({ highWaterMark: 1, overflow: 'wait' })
  t.assert.strictEqual(queue.overflow, 'wait')
  t.assert.strictEqual(queue.push('a'), false)
  t.assert.strictEqual(queue.push('b'), false)
  t.assert.strictEqual(queue.length, 2)

  let room = false
  queue.waitForRoom(() => { room = true })
  t.assert.deepStrictEqual(await queue.next(), { value: 'a', done: false })
  t.assert.strictEqual(room, false)
  t.assert.deepStrictEqual(await queue.next(), { value: 'b', done: false })
  t.assert.strictEqual(room, true)
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
  // its events are dropped
  t.assert.strictEqual(closing.length, 0)
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
  t.assert.strictEqual(queue.push('b'), false)

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
