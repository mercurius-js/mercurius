'use strict'

const { test } = require('tap')
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
  t.teardown(() => app.close())

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
  t.teardown(client.destroy.bind(client))
  client.setEncoding('utf8')
  return { client, ws }
}

test('subscription - hooks basic', async t => {
  t.plan(13)

  const app = await createTestServer(t)

  app.graphql.addHook('preSubscriptionParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.ok('preSubscriptionParsing called')
  })
  app.graphql.addHook('preSubscriptionExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preSubscriptionExecution called')
  })
  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    t.same(execution, {
      data: {
        notificationAdded: {
          id: '1',
          message: 'Hello World'
        }
      }
    })
    t.type(context, 'object')
    t.ok('onSubscriptionResolution called')
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
    t.equal(data.type, 'connection_ack')
  }

  sendTestMutation(app)

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.same(data, {
      id: 1,
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
    t.fail('preSubscriptionParsing should not be called again')
  })
  app.graphql.addHook('preSubscriptionExecution', async (schema, document, context) => {
    t.fail('preSubscriptionExecution should not be called')
  })
  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    t.fail('onSubscriptionResolution should not be called')
  })

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.equal(data.type, 'connection_ack')
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
    t.same(data, {
      id: 1,
      type: 'error',
      payload: 'a preSubscriptionParsing error occurred'
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
    t.fail('preSubscriptionExecution should not be called again')
  })
  app.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
    t.fail('onSubscriptionResolution should not be called')
  })

  await app.listen({ port: 0 })

  const { client } = createWebSocketClient(t, app)

  client.write(JSON.stringify({
    type: 'connection_init'
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.equal(data.type, 'connection_ack')
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
    t.same(data, {
      id: 1,
      type: 'error',
      payload: 'a preSubscriptionExecution error occurred'
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
    t.fail('onSubscriptionResolution should not be called agin')
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
    t.equal(data.type, 'connection_ack')
  }

  sendTestMutation(app)

  await once(client, 'end')
  t.equal(ws.readyState, WebSocket.CLOSED)
})

// -----------------
// onSubscriptionEnd
// -----------------
test('subscription - should call onSubscriptionEnd when subscription ends', async t => {
  t.plan(5)
  const app = await createTestServer(t)

  app.graphql.addHook('onSubscriptionEnd', async (context, id) => {
    t.type(context, 'object')
    t.equal(id, 1)
    t.ok('onSubscriptionEnd called')
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
    t.equal(data.type, 'connection_ack')
  }

  client.write(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.equal(data.type, 'complete')
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
    t.equal(data.type, 'connection_ack')
  }

  client.write(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  await once(client, 'end')
  t.equal(ws.readyState, WebSocket.CLOSED)
})
