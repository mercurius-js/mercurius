'use strict'

const { test } = require('node:test')
const { EventEmitter, once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const Fastify = require('fastify')
const WebSocket = require('ws')
const SendQueue = require('../lib/subscription-send-queue')
const GQL = require('..')

// A socket whose writes complete when the test says the kernel accepted them.
function fakeSocket () {
  const socket = new EventEmitter()
  socket.readyState = WebSocket.OPEN
  socket.sent = []
  socket.callbacks = []
  socket.send = (data, cb) => {
    socket.sent.push(data)
    socket.callbacks.push(cb)
  }
  socket.accept = (err) => socket.callbacks.shift()(err)
  return socket
}

function message (n) {
  // 30 bytes
  return String(n).padEnd(30, '.')
}

test('SendQueue queues the messages beyond highWaterMark until the kernel accepts the pending ones', (t) => {
  const socket = fakeSocket()
  const queue = new SendQueue(socket, 100)
  const done = []

  for (let i = 0; i < 6; i++) {
    queue.send(message(i), (err) => done.push(err ?? i))
  }
  t.assert.deepStrictEqual(socket.sent, [message(0), message(1), message(2), message(3)])
  t.assert.strictEqual(queue.pending, 120)

  socket.accept()
  t.assert.deepStrictEqual(done, [0])
  t.assert.deepStrictEqual(socket.sent.slice(4), [message(4)])

  socket.accept()
  socket.accept()
  t.assert.deepStrictEqual(done, [0, 1, 2])
  t.assert.deepStrictEqual(socket.sent.slice(4), [message(4), message(5)])
  t.assert.strictEqual(queue.pending, 90)

  // no message waits: the next one is sent at once
  queue.send(message(6), (err) => done.push(err ?? 6))
  t.assert.deepStrictEqual(socket.sent.slice(6), [message(6)])
})

test('SendQueue writes ahead of the queued messages', (t) => {
  const socket = fakeSocket()
  const queue = new SendQueue(socket, 10)

  queue.send(message(0), () => {})
  queue.send(message(1), () => {})
  queue.write('ka', () => {})
  t.assert.deepStrictEqual(socket.sent, [message(0), 'ka'])

  socket.accept()
  socket.accept()
  t.assert.deepStrictEqual(socket.sent, [message(0), 'ka', message(1)])
})

test('SendQueue releases the queued messages without sending them when the socket closes', (t) => {
  const socket = fakeSocket()
  const queue = new SendQueue(socket, 10)
  const done = []

  queue.send(message(0), (err) => done.push(err ?? 0))
  queue.send(message(1), (err) => done.push(err ?? 1))
  queue.send(message(2), (err) => done.push(err ?? 2))

  socket.readyState = WebSocket.CLOSED
  socket.emit('close')
  t.assert.deepStrictEqual(done, [1, 2])

  const error = new Error('WebSocket is not open')
  socket.accept(error)
  t.assert.deepStrictEqual(done, [1, 2, error])
  t.assert.deepStrictEqual(socket.sent, [message(0)])
})

test('SendQueue leaves the messages sent while the socket is closing to ws', (t) => {
  const socket = fakeSocket()
  const queue = new SendQueue(socket, 10)
  const done = []

  queue.send(message(0), () => {})
  queue.send(message(1), (err) => done.push(err ?? 1))
  socket.readyState = WebSocket.CLOSING

  // sent at once, however many bytes are pending, for ws to fail it
  queue.send(message(2), (err) => done.push(err ?? 2))
  t.assert.deepStrictEqual(socket.sent, [message(0), message(2)])

  // the queued message is not sent to a closing socket
  const error = new Error('WebSocket is not open')
  socket.accept(error)
  socket.accept(error)
  t.assert.deepStrictEqual(done, [error])
  t.assert.deepStrictEqual(socket.sent, [message(0), message(2)])
})

const SUBSCRIPTIONS = 10
const MESSAGE_SIZE = 16 * 1024

async function until (condition, what) {
  for (let i = 0; i < 500; i++) {
    if (condition()) {
      return
    }
    await sleep(10)
  }
  throw new Error(`timeout waiting for ${what}`)
}

// Subscriptions that produce messages as fast as the server sends them, on a
// connection whose client has stopped reading. Resolves once the kernel buffers
// are full and every subscription waits.
async function setup (t, { wsHighWaterMark }) {
  const state = { produced: 0, received: [] }
  const app = Fastify()
  app.register(GQL, {
    schema: `
      type Query {
        _placeholder: String
      }
      type Subscription {
        onTick: String
      }
    `,
    resolvers: {
      Subscription: {
        onTick: {
          subscribe: async function * () {
            for (let n = 0; ; n++) {
              state.produced++
              yield { onTick: `${n}:${'a'.repeat(MESSAGE_SIZE)}` }
            }
          }
        }
      }
    },
    subscription: {
      wsHighWaterMark,
      context (socket) {
        state.serverSocket = socket
        return {}
      }
    }
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

  ws.on('message', (data) => {
    const { type, id, payload } = JSON.parse(data)
    state.received.push(type === 'next' ? { id, n: Number(payload.data.onTick.split(':')[0]) } : type)
  })
  ws.pause()
  for (let i = 0; i < SUBSCRIPTIONS; i++) {
    ws.send(JSON.stringify({ id: String(i), type: 'subscribe', payload: { query: 'subscription { onTick }' } }))
  }
  state.ws = ws

  let last = -1
  await until(() => {
    const stalled = state.produced > SUBSCRIPTIONS && state.produced === last
    last = state.produced
    return stalled
  }, 'the subscriptions to stall')

  return state
}

test('subscription with wsHighWaterMark limits the bytes waiting in Node across the subscriptions of a connection', async (t) => {
  const state = await setup(t, { wsHighWaterMark: MESSAGE_SIZE })

  // without it, one message per subscription waits
  t.assert.ok(state.serverSocket.bufferedAmount < 2 * MESSAGE_SIZE, `${state.serverSocket.bufferedAmount} bytes waiting in Node`)

  state.ws.resume()

  const PER_SUBSCRIPTION = 20
  const ordered = () => {
    const byId = new Map()
    for (const { id, n } of state.received) {
      if (!byId.has(id)) byId.set(id, [])
      byId.get(id).push(n)
    }
    return byId
  }
  await until(() => {
    const byId = ordered()
    return byId.size === SUBSCRIPTIONS && [...byId.values()].every(ns => ns.length >= PER_SUBSCRIPTION)
  }, 'every subscription to receive its messages')
  for (const ns of ordered().values()) {
    t.assert.deepStrictEqual(ns.slice(0, PER_SUBSCRIPTION), Array.from({ length: PER_SUBSCRIPTION }, (_, i) => i))
  }
})

test('subscription with wsHighWaterMark answers a graphql-transport-ws ping ahead of the queued messages', async (t) => {
  const state = await setup(t, { wsHighWaterMark: MESSAGE_SIZE })

  state.ws.send(JSON.stringify({ type: 'ping' }))
  await sleep(100)
  const produced = state.produced
  state.ws.resume()

  await until(() => state.received.includes('pong'), 'the pong')
  // a message of every subscription but one waits in the queue
  const before = state.received.indexOf('pong')
  t.assert.ok(before <= produced - (SUBSCRIPTIONS - 1), `${before} of the ${produced} messages produced arrived before the pong`)
})
