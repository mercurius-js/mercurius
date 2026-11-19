'use strict'
const { test } = require('node:test')
const WebSocket = require('ws')
const fastify = require('fastify')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const mercurius = require('../index')

async function createApp (t) {
  const state = { started: 0, active: 0 }
  const app = fastify()
  t.after(() => app.close())

  app.register(mercurius, {
    schema: `
      type Query { add(x: Int, y: Int): Int }
      type Subscription { onMessage: String }
    `,
    resolvers: {
      Subscription: {
        onMessage: {
          subscribe: async function * (root, args, { pubsub }) {
            state.started++
            state.active++
            try {
              for await (const event of await pubsub.subscribe('MESSAGE')) {
                yield event
              }
            } finally {
              state.active--
            }
          }
        }
      }
    },
    subscription: true
  })

  await app.listen({ port: 0 })
  return { app, state }
}

async function connect (t, app, protocol) {
  const ws = new WebSocket(`ws://localhost:${app.server.address().port}/graphql`, protocol)
  t.after(() => ws.terminate())
  const messages = []
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))
  await once(ws, 'open')
  ws.send(JSON.stringify({ type: 'connection_init' }))
  await waitUntil(() => messages.some((m) => m.type === 'connection_ack'))
  return { ws, messages, send: (message) => ws.send(JSON.stringify(message)) }
}

async function waitUntil (condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return true
    await sleep(20)
  }
  return false
}

test('a duplicate operation id closes the connection with 4409 (protocol: graphql-transport-ws)', async (t) => {
  const { app, state } = await createApp(t)
  const client = await connect(t, app, 'graphql-transport-ws')
  const closed = once(client.ws, 'close')

  const subscribe = { id: '1', type: 'subscribe', payload: { query: 'subscription { onMessage }' } }
  client.send(subscribe)
  client.send(subscribe)

  const [code, reason] = await Promise.race([closed, sleep(2000).then(() => [null, null])])
  t.assert.strictEqual(code, 4409)
  t.assert.strictEqual(reason.toString(), 'Subscriber for 1 already exists')

  t.assert.ok(await waitUntil(() => state.active === 0), 'no subscription is left running')
  t.assert.ok(state.started <= 1, 'the duplicate subscription is not executed')
})

test('a duplicate operation id is rejected and the first subscription keeps working (protocol: graphql-ws)', async (t) => {
  const { app, state } = await createApp(t)
  const client = await connect(t, app, 'graphql-ws')

  const start = { id: '1', type: 'start', payload: { query: 'subscription { onMessage }' } }
  client.send(start)
  client.send(start)

  t.assert.ok(await waitUntil(() => client.messages.some((m) => m.type === 'error' && m.id === '1')), 'the duplicate start is rejected')
  t.assert.deepStrictEqual(client.messages.find((m) => m.type === 'error').payload, [{ message: 'Subscriber for 1 already exists' }])
  t.assert.ok(await waitUntil(() => state.active === 1))

  await app.graphql.pubsub.publish({ topic: 'MESSAGE', payload: { onMessage: 'hello' } })
  t.assert.ok(await waitUntil(() => client.messages.some((m) => m.type === 'data')))
  await sleep(50)
  t.assert.strictEqual(client.messages.filter((m) => m.type === 'data' && m.id === '1').length, 1)

  client.send({ id: '1', type: 'stop' })
  t.assert.ok(await waitUntil(() => state.active === 0), 'no subscription is left running after stop')
  t.assert.strictEqual(state.started, 1)
})

test('an operation stopped while subscribe() is pending does not keep running, and its id can be reused', async (t) => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const state = { active: 0, calls: 0 }
  const app = fastify()
  t.after(() => app.close())

  app.register(mercurius, {
    schema: `
      type Query { add(x: Int, y: Int): Int }
      type Subscription { onMessage: String }
    `,
    resolvers: {
      Subscription: {
        onMessage: {
          subscribe: async (root, args, { pubsub }) => {
            state.calls++
            if (state.calls === 1) {
              await gate
            }
            const events = await pubsub.subscribe('MESSAGE')
            return (async function * () {
              state.active++
              try {
                for await (const event of events) {
                  yield event
                }
              } finally {
                state.active--
              }
            })()
          }
        }
      }
    },
    subscription: true
  })
  await app.listen({ port: 0 })

  const client = await connect(t, app, 'graphql-transport-ws')
  const subscribe = { id: '1', type: 'subscribe', payload: { query: 'subscription { onMessage }' } }

  client.send(subscribe)
  t.assert.ok(await waitUntil(() => state.calls === 1))
  client.send({ id: '1', type: 'complete' })
  await sleep(50)

  // the id is free again: a new operation with the same id is accepted
  client.send(subscribe)
  t.assert.ok(await waitUntil(() => state.active === 1))

  release()
  await sleep(50)
  t.assert.strictEqual(state.active, 1, 'the stopped operation is not started')
  t.assert.strictEqual(client.ws.readyState, WebSocket.OPEN)

  await app.graphql.pubsub.publish({ topic: 'MESSAGE', payload: { onMessage: 'hello' } })
  t.assert.ok(await waitUntil(() => client.messages.some((m) => m.type === 'next')))
  await sleep(50)
  t.assert.strictEqual(client.messages.filter((m) => m.type === 'next').length, 1)
})
