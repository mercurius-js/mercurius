'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const WebSocket = require('ws')
const mq = require('mqemitter')
const { once } = require('events')
const { GraphQLSchema, parse } = require('graphql')
const GQL = require('..')

function sendTestMutation (app) {
  app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: `
        mutation {
          addNotification(message: "Hello World") {
            id
          }
        }
      `
    }
  }, () => {})
}

const query = `subscription {
  notificationAdded {
    id
    message
  }
}`

function createTestServer (t) {
  const app = Fastify()
  t.after(() => app.close())

  const emitter = mq()

  const schema = `
    type Notification {
      id: ID!
      message: String
    }

    type Query {
      notifications: [Notification]
    }

    type Mutation {
      addNotification(message: String): Notification
    }

    type Subscription {
      notificationAdded: Notification
    }
  `

  const resolvers = {
    Mutation: {
      addNotification: async (_, { message }) => {
        const notification = {
          id: 1,
          message
        }
        await emitter.emit({
          topic: 'NOTIFICATION_ADDED',
          payload: {
            notificationAdded: notification
          }
        })

        return notification
      }
    },
    Subscription: {
      notificationAdded: {
        subscribe: (root, args, { pubsub }) => pubsub.subscribe('NOTIFICATION_ADDED')
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      emitter
    }
  })

  return app
}

function createWebSocketClient (t, app) {
  const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
  t.after(() => client.end())
  client.setEncoding('utf8')
  return { client, ws }
}

test('subscription - hooks basic', async t => {
  const app = await createTestServer(t)

  const hooksCalls = []

  {
    let resolve, reject
    hooksCalls.push(new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject }))
    app.graphql.addHook('preSubscriptionParsing', async (schema, source, context, id) => {
      try {
        assert.ok(schema instanceof GraphQLSchema)
        assert.equal(source, query)
        assert.equal(typeof context, 'object')
        assert.equal(id, 'the-subscription-id')
        assert.ok('preSubscriptionParsing called')
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  {
    let resolve, reject
    hooksCalls.push(new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject }))
    app.graphql.addHook('preSubscriptionExecution', async (schema, document, context, id) => {
      try {
        assert.ok(schema instanceof GraphQLSchema)
        assert.deepEqual(document, parse(query))
        assert.equal(typeof context, 'object')
        assert.equal(id, 'the-subscription-id')
        assert.ok('preSubscriptionExecution called')
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  {
    let resolve, reject
    hooksCalls.push(new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject }))
    app.graphql.addHook('onSubscriptionResolution', async (execution, context, id) => {
      try {
        assert.deepEqual(execution, {
          data: {
            notificationAdded: {
              id: '1',
              message: 'Hello World'
            }
          }
        })
        assert.equal(typeof context, 'object')
        assert.equal(id, 'the-subscription-id')
        assert.ok('onSubscriptionResolution called')
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))
  client.write(JSON.stringify({
    id: 'the-subscription-id',
    type: 'start',
    payload: {
      query
    }
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    assert.equal(data.type, 'connection_ack')
  }

  sendTestMutation(app)

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    assert.deepEqual(data, {
      id: 'the-subscription-id',
      type: 'data',
      payload: {
        data: {
          notificationAdded: {
            id: '1',
            message: 'Hello World'
          }
        }
      }
    })
  }

  await Promise.all(hooksCalls)
})

// -----------------------
// preSubscriptionParsing
// -----------------------
test('subscription - should handle preSubscriptionParsing hook errors', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  app.graphql.addHook('preSubscriptionParsing', async (schema, source, context) => {
    throw new Error('a preSubscriptionParsing error occurred')
  })
  app.graphql.addHook('preSubscriptionParsing', async (schema, document, context) => {
    t.assert.fail('preSubscriptionParsing should not be called again')
  })
  app.graphql.addHook('preSubscriptionExecution', async (schema, document, context) => {
    t.assert.fail('preSubscriptionExecution should not be called')
  })
  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    t.assert.fail('onSubscriptionResolution should not be called')
  })

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.equal(data.type, 'connection_ack')
  }

  client.write(JSON.stringify({
    id: 1,
    type: 'start',
    payload: {
      query
    }
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.deepEqual(data, {
      id: 1,
      type: 'error',
      payload: [{ message: 'a preSubscriptionParsing error occurred' }]
    })
  }
})

// -----------------------
// preSubscriptionExecution
// -----------------------
test('subscription - should handle preSubscriptionExecution hook errors', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  app.graphql.addHook('preSubscriptionExecution', async (schema, document, context) => {
    throw new Error('a preSubscriptionExecution error occurred')
  })
  app.graphql.addHook('preSubscriptionExecution', async (execution, context) => {
    t.assert.fail('preSubscriptionExecution should not be called again')
  })
  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    t.assert.fail('onSubscriptionResolution should not be called')
  })

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.equal(data.type, 'connection_ack')
  }

  client.write(JSON.stringify({
    id: 1,
    type: 'start',
    payload: {
      query
    }
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.deepEqual(data, {
      id: 1,
      type: 'error',
      payload: [{ message: 'a preSubscriptionExecution error occurred' }]
    })
  }
})

// -----------------------
// onSubscriptionResolution
// -----------------------
test('subscription - should handle onSubscriptionResolution hook errors', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    throw new Error('kaboom')
  })

  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    t.assert.fail('onSubscriptionResolution should not be called agin')
  })

  await app.listen({ port: 0 })

  const { client, ws } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))
  client.write(JSON.stringify({
    id: 1,
    type: 'start',
    payload: {
      query
    }
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.equal(data.type, 'connection_ack')
  }

  sendTestMutation(app)

  await once(client, 'end')
  t.assert.equal(ws.readyState, WebSocket.CLOSED)
})

// -----------------
// onSubscriptionEnd
// -----------------
test('subscription - should call onSubscriptionEnd when subscription ends', async t => {
  t.plan(5)
  const app = await createTestServer(t)

  app.graphql.addHook('onSubscriptionEnd', async (context, id) => {
    t.assert.equal(typeof context, 'object')
    t.assert.equal(id, 1)
    t.assert.ok('onSubscriptionEnd called')
  })

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))
  client.write(JSON.stringify({
    id: 1,
    type: 'start',
    payload: {
      query
    }
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.equal(data.type, 'connection_ack')
  }

  client.write(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.equal(data.type, 'complete')
  }
})

test('subscription - should handle onSubscriptionEnd hook errors', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  app.graphql.addHook('onSubscriptionEnd', async (context, id) => {
    throw new Error('kaboom')
  })

  await app.listen({ port: 0 })

  const { client, ws } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))
  client.write(JSON.stringify({
    id: 1,
    type: 'start',
    payload: {
      query
    }
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.assert.equal(data.type, 'connection_ack')
  }

  client.write(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  await once(client, 'end')
  t.assert.equal(ws.readyState, WebSocket.CLOSED)
})

test('subscription - should call onSubscriptionEnd with same hook context', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  let contextSpy
  app.graphql.addHook('preSubscriptionParsing', async (schema, source, context) => {
    contextSpy = context
    context.hooks = ['preSubscriptionParsing']
  })
  app.graphql.addHook('preSubscriptionExecution', async (schema, document, context) => {
    context.hooks.push('preSubscriptionExecution')
  })
  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    context.hooks.push('onSubscriptionResolution')
  })
  app.graphql.addHook('onSubscriptionEnd', async (context, id) => {
    context.hooks.push('onSubscriptionEnd')
  })

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))
  client.write(JSON.stringify({
    id: 1,
    type: 'start',
    payload: { query }
  }))

  await once(client, 'data') // ack
  sendTestMutation(app)
  await once(client, 'data') // subscription data
  client.write(JSON.stringify({ id: 1, type: 'stop' }))
  await once(client, 'data') // complete

  t.assert.deepEqual(contextSpy.hooks, ['preSubscriptionParsing', 'preSubscriptionExecution', 'onSubscriptionResolution', 'onSubscriptionEnd'])
})

// -----------------
// onSubscriptionConnectionClose
// -----------------

test('subscription - should call onSubscriptionConnectionClose when subscription connection closes', async t => {
  const app = await createTestServer(t)

  let resolve, reject
  const hookCall = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })

  app.graphql.addHook('onSubscriptionConnectionClose', async (context, code, reason) => {
    try {
      assert.equal(typeof context, 'object')
      assert.equal(code, 1005)
      assert.equal(reason, '')
      assert.ok('onSubscriptionConnectionClose called')
      resolve()
    } catch (error) {
      reject(error)
    }
  })

  await app.listen({ port: 0 })

  const { client, ws } = createWebSocketClient(t, app)

  client.write(JSON.stringify({ type: 'connection_init' }))
  await once(client, 'data') // connection_ack

  // Close the connection
  ws.close()

  await once(ws, 'close')
  await hookCall
})

test('subscription - should handle errors in onSubscriptionConnectionClose', async t => {
  const app = await createTestServer(t)

  let resolve
  const hookCall = new Promise((_resolve) => { resolve = _resolve })

  app.graphql.addHook('onSubscriptionConnectionClose', async (context, code, reason) => {
    resolve()
    throw new Error('kaboom')
  })

  await app.listen({ port: 0 })

  const { client, ws } = createWebSocketClient(t, app)

  client.write(JSON.stringify({ type: 'connection_init' }))
  await once(client, 'data') // connection_ack

  // Close the connection
  ws.close()

  await once(ws, 'close')
  assert.equal(ws.readyState, WebSocket.CLOSED)
  await hookCall
})

// -----------------
// onSubscriptionConnectionError
// -----------------

test('subscription - should call onSubscriptionConnectionError when subscription connection errors', async t => {
  const app = await createTestServer(t)

  let resolve, reject
  const assertion = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })

  app.graphql.addHook('onSubscriptionConnectionError', async (context, error) => {
    try {
      assert.equal(typeof context, 'object')
      assert.ok(error instanceof Error)
      assert.equal(error.message, 'Invalid WebSocket frame: invalid opcode 5')
      resolve()
    } catch (error) {
      reject(error)
    }
  })

  await app.listen({ port: 0 })

  const { client, ws } = createWebSocketClient(t, app)

  client.write(JSON.stringify({ type: 'connection_init' }))
  await once(client, 'data') // connection_ack

  ws._socket.write(Buffer.from([0x85, 0x00]))

  await once(ws, 'close')
  await assertion
})

test('subscription - should handle errors in onSubscriptionConnectionError', async t => {
  const app = await createTestServer(t)

  let resolve, reject
  const assertion = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })

  app.graphql.addHook('onSubscriptionConnectionError', async (context, error) => {
    try {
      assert.equal(typeof context, 'object')
      assert.ok(error instanceof Error)
      resolve()
      throw new Error('kaboom')
    } catch (error) {
      reject(error)
    }
  })

  await app.listen({ port: 0 })

  const { client, ws } = createWebSocketClient(t, app)

  client.write(JSON.stringify({ type: 'connection_init' }))
  await once(client, 'data') // connection_ack

  ws._socket.write(Buffer.from([0x85, 0x00]))

  await once(ws, 'close')
  await assertion
})

test('subscription - should call subscription hooks with same message id', async t => {
  const app = await createTestServer(t)

  let contextSpy
  app.graphql.addHook('preSubscriptionParsing', async (schema, source, context, id) => {
    contextSpy = context
    context.ids = [{ preSubscriptionParsing: id }]
  })
  app.graphql.addHook('preSubscriptionExecution', async (schema, document, context, id) => {
    context.ids.push({ preSubscriptionExecution: id })
  })
  app.graphql.addHook('onSubscriptionResolution', async (execution, context, id) => {
    context.ids.push({ onSubscriptionResolution: id })
  })
  app.graphql.addHook('onSubscriptionEnd', async (context, id) => {
    context.ids.push({ onSubscriptionEnd: id })
  })

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))
  client.write(JSON.stringify({
    id: 'the-subscription-id',
    type: 'start',
    payload: { query }
  }))

  await once(client, 'data') // ack
  sendTestMutation(app)
  await once(client, 'data') // subscription data
  client.write(JSON.stringify({ id: 'the-subscription-id', type: 'stop' }))
  await once(client, 'data') // complete

  assert.deepEqual(contextSpy.ids, [
    { preSubscriptionParsing: 'the-subscription-id' },
    { preSubscriptionExecution: 'the-subscription-id' },
    { onSubscriptionResolution: 'the-subscription-id' },
    { onSubscriptionEnd: 'the-subscription-id' }]
  )
})
