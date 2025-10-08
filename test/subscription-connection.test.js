'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const WebSocket = require('ws')
const fastify = require('fastify')
const mq = require('mqemitter')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const SubscriptionConnection = require('../lib/subscription-connection')
const { PubSub } = require('../lib/subscriber')
const { GRAPHQL_WS, GRAPHQL_TRANSPORT_WS } = require('../lib/subscription-protocol')
const { setImmediate: immediate } = require('timers/promises')
const { EventEmitter, once, on } = require('node:events')
const mercurius = require('../index')

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

test('socket is closed on unhandled promise rejection in handleMessage', (t, done) => {
  t.plan(1)
  let handleConnectionCloseCalled = false
  class MockSubscriptionConnection extends SubscriptionConnection {
    async handleMessage (message) {
      throw new Error('error')
      // return Promise.reject(new Error('some error'))
    }

    handleConnectionClose () {
      handleConnectionCloseCalled = true
      this.socket.close()
    }
  }

  const subscription = proxyquire('../lib/subscription', {
    './subscription-connection': MockSubscriptionConnection
  })

  const app = fastify()
  t.after(() => app.close())
  app.register(subscription, {
    getOptions: {
      url: '/graphql',
      method: 'GET',
      handler: async function (request, reply) {
        return 'ok'
      }
    },
    schema: `
      type Subscribtion {
        onMessage: String
      }
    `,
    subscriber: new PubSub(mq())
  })

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-transport-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.after(() => client.destroy.bind(client))

    client.on('error', () => {})
    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init_error'
    }))
    ws.on('close', () => {
      t.assert.strictEqual(handleConnectionCloseCalled, true)
      done()
    })
  })
})

test('subscription connection handles connection close when socket emit close event', async (t) => {
  const socket = new EventEmitter()
  socket.protocol = GRAPHQL_TRANSPORT_WS
  socket.send = () => {}
  socket.close = () => {}
  class Mocked extends SubscriptionConnection {
  }
  capture(Mocked.prototype, 'handleConnectionClose')
  // eslint-disable-next-line no-new
  new Mocked(socket, {})
  socket.emit('close')
  t.assert.strictEqual(Mocked.prototype.handleConnectionClose.calls.length, 1)
})

test('subscription connection handles connection close when socket emit error event', async (t) => {
  const socket = new EventEmitter()
  socket.protocol = GRAPHQL_TRANSPORT_WS
  socket.send = () => {}
  socket.close = () => {}
  class Mocked extends SubscriptionConnection {
  }
  capture(Mocked.prototype, 'handleConnectionClose')
  // eslint-disable-next-line no-new
  new Mocked(socket, {})
  socket.emit('error')
  t.assert.strictEqual(Mocked.prototype.handleConnectionClose.calls.length, 1)
})

test('subscription connection should close socket when close called', async (t) => {
  const socket = new EventEmitter()
  socket.protocol = GRAPHQL_TRANSPORT_WS
  socket.send = () => {}
  socket.close = () => {}
  capture(socket, 'close')
  const sc = new SubscriptionConnection(socket, {})
  sc.close()
  t.assert.strictEqual(socket.close.calls.length, 1)
})

test('subscription connection sends error message when message is not json string', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    send (message) {
      t.assert.strictEqual(JSON.stringify({
        type: 'error',
        id: null,
        payload: [{ message: 'Message must be a JSON string' }]
      }), message)
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  await sc.handleMessage('invalid json string')
})

test('subscription connection handles GQL_CONNECTION_TERMINATE message correctly', async (t) => {
  t.plan(1)
  const sc = new SubscriptionConnection({
    on () {},
    close () { t.assert.ok('close') },
    send (message) {},
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'connection_terminate'
  }))
})

test('subscription connection closes context on GQL_STOP message correctly (protocol: graphql-ws)', async (t) => {
  t.plan(2)
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {},
    protocol: GRAPHQL_WS
  }, {})

  sc.subscriptionContexts = new Map()
  sc.subscriptionContexts.set(1, {
    close () {
      t.assert.ok('close')
    }
  })

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  t.assert.strictEqual(sc.subscriptionContexts.size, 0)
})

test('subscription connection closes context on GQL_STOP message correctly (protocol: graphql-transport-ws)', async (t) => {
  t.plan(2)
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {},
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  sc.subscriptionContexts = new Map()
  sc.subscriptionContexts.set(1, {
    close () {
      t.assert.ok('close')
    }
  })

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'complete'
  }))

  t.assert.strictEqual(sc.subscriptionContexts.size, 0)
})

test('subscription connection completes resolver iterator on GQL_STOP message correctly (protocol: graphql-ws)', async (t) => {
  t.plan(2)
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {},
    protocol: GRAPHQL_WS
  }, {})

  sc.subscriptionIters = new Map()
  sc.subscriptionIters.set(1, {
    return () {
      t.assert.ok('close')
    }
  })

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  t.assert.strictEqual(sc.subscriptionIters.size, 0)
})

test('subscription connection completes resolver iterator on GQL_STOP message correctly (protocol: graphql-transport-ws)', async (t) => {
  t.plan(2)
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {},
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  sc.subscriptionIters = new Map()
  sc.subscriptionIters.set(1, {
    return () {
      t.assert.ok('close')
    }
  })

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'complete'
  }))

  t.assert.strictEqual(sc.subscriptionIters.size, 0)
})

test('handles error in send and closes connection', async t => {
  t.plan(1)

  const sc = new SubscriptionConnection(
    {
      send (message) {
        throw new Error('Socket closed')
      },
      close () {
        t.assert.ok('close')
      },
      on () {},
      protocol: GRAPHQL_TRANSPORT_WS
    },
    {}
  )

  await sc.sendMessage('foo')
})

test('subscription connection handles GQL_STOP message correctly, with no data (protocol: graphql-ws)', async (t) => {
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {},
    protocol: GRAPHQL_WS
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  t.assert.ok(!sc.subscriptionContexts.get(0))
})

test('subscription connection handles GQL_STOP message correctly, with no data (protocol: graphql-transport-ws)', async (t) => {
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {},
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'complete'
  }))

  t.assert.ok(!sc.subscriptionContexts.get(0))
})

test('subscription connection send error message when GQL_START handler errs', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.assert.strictEqual(JSON.stringify({
        type: 'error',
        id: 1,
        payload: [{ message: 'handleGQLStart error' }]
      }), message)
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  sc.isReady = true

  sc.handleGQLStart = async (data) => {
    throw new Error('handleGQLStart error')
  }

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'subscribe',
    payload: { }
  }))
})

test('subscription connection send error message when client message type is invalid', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.assert.strictEqual(JSON.stringify({
        type: 'error',
        id: 1,
        payload: [{ message: 'Invalid payload type' }]
      }), message)
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'invalid-type',
    payload: { }
  }))
})

test('subscription connection handles GQL_START message correctly, when payload.query is not defined', (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.assert.strictEqual(JSON.stringify(
        { type: 'error', id: 1, payload: [{ message: 'Must provide document.' }] }
      ), message)
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  sc.isReady = true

  sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'subscribe',
    payload: { }
  }))
})

test('subscription connection handles when GQL_START is called before GQL_INIT', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message, cb) {
      t.assert.strictEqual(JSON.stringify(
        { type: 'connection_error', payload: { message: 'Connection has not been established yet.' } }
      ), message)
      cb()
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'subscribe',
    payload: { }
  }))
})

test('subscription connection replies to GQL_CONNECTION_KEEP_ALIVE message with GQL_CONNECTION_KEEP_ALIVE_ACK', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection(
    {
      on () {},
      close () {},
      send (message, cb) {
        t.assert.strictEqual(
          JSON.stringify({
            type: 'pong',
            id: 1
          }),
          message
        )
        cb()
      },
      protocol: GRAPHQL_TRANSPORT_WS
    },
    {}
  )

  await sc.handleMessage(
    JSON.stringify({
      id: 1,
      type: 'ping',
      payload: {}
    })
  )
})

test('subscription connection does not error if client sends GQL_CONNECTION_KEEP_ALIVE_ACK', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection(
    {
      on () {},
      close () {},
      send (message, cb) {
        t.assert.fail()
        cb()
      },
      protocol: GRAPHQL_TRANSPORT_WS
    },
    {}
  )

  await sc.handleMessage(
    JSON.stringify({
      id: 1,
      type: 'pong',
      payload: {}
    })
  )

  await sc.handleMessage(
    JSON.stringify({
      id: 1,
      type: 'complete'
    })
  )

  t.assert.strictEqual(sc.subscriptionContexts.size, 0)
})

test('subscription connection extends context with onConnect return value', async (t) => {
  t.plan(3)

  const context = {
    a: 1
  }

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message, cb) {
      t.assert.strictEqual(JSON.stringify({ type: 'connection_ack' }), message)
      cb()
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {
    context,
    onConnect: function () {
      return { data: true }
    }
  })

  await sc.handleConnectionInit({})
  t.assert.strictEqual(sc.context.data, true)
  t.assert.strictEqual(sc.context.a, 1)
})

test('subscription connection send GQL_ERROR message if connectionInit extension is defined and onConnect returns a falsy value', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message, cb) {
      t.assert.deepEqual(JSON.parse(message), {
        id: 1,
        type: 'error',
        payload: [{ message: 'Forbidden' }]
      })
      cb()
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {
    onConnect: function () {
      throw new Error('Not allowed')
    },
    fastify: {
      log: {
        error: () => {}
      }
    }
  })

  // TODO FIXME? This case doesn't seem to be allowed by the protocol: https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectioninit
  // When onConnect returns a "falsy" value then it CANNOT be "ready", it should just deny the connection.
  // However, this is an "extension"; if it's valid, perhaps should be better documented?
  sc.isReady = true
  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'subscribe',
    payload: {},
    extensions: [
      { type: 'connectionInit' }
    ]
  }))
})

test('subscription connection does not create subscription if connectionInit extension is defined and onConnect returns a falsy value', async (t) => {
  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message) {},
    protocol: GRAPHQL_TRANSPORT_WS
  }, {
    onConnect: function () {
      throw new Error('Not allowed')
    },
    fastify: {
      log: {
        error: () => {}
      }
    }
  })

  sc.isReady = true
  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'subscribe',
    payload: {},
    extensions: [
      { type: 'connectionInit' }
    ]
  }))

  t.assert.ok(!sc.subscriptionContexts.get(0))
})

test('subscription connection send GQL_ERROR on unknown extension', async (t) => {
  t.plan(2)

  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message, cb) {
      t.assert.deepEqual(JSON.parse(message), {
        id: 1,
        type: 'error',
        payload: [{ message: 'Unknown extension unknown' }]
      })
      cb()
    },
    protocol: GRAPHQL_TRANSPORT_WS
  }, { })

  sc.isReady = true
  // TODO FIXME? This case doesn't seem to be allowed by the protocol: https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#subscribe
  // When type is "Subscribe", the `payload` cannot be empty (the `query` prop is required).
  // However, this is an "extension"; if it's valid, perhaps should be better documented?
  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'subscribe',
    payload: {},
    extensions: [
      { type: 'unknown' }
    ]
  }))

  t.assert.ok(!sc.subscriptionContexts.get(0))
})

test('subscription connection handleConnectionInitExtension returns the onConnect return value', async (t) => {
  const onConnectResult = {
    hello: 'world'
  }
  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message) { },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {
    onConnect: function () {
      return onConnectResult
    },
    fastify: {
      log: {
        error: () => { }
      }
    }
  })

  sc.isReady = true
  const res = await sc.handleConnectionInitExtension({ type: 'connectionInit' })

  t.assert.deepEqual(res, onConnectResult)
})

test('subscription connection extends the context with the connection_init payload', async (t) => {
  const connectionInitPayload = {
    hello: 'world'
  }
  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message, cb) { cb() },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {})

  await sc.handleConnectionInit({ type: 'connection_init', payload: connectionInitPayload })

  t.assert.deepEqual(sc.context._connectionInit, connectionInitPayload)
})

test('subscription connection sends error when trying to execute invalid operations via WS', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection(
    {
      on () {},
      send (message, cb) {
        t.assert.strictEqual(
          JSON.stringify({
            type: 'error',
            id: 1,
            payload: [{ message: 'Invalid operation: query' }]
          }),
          message
        )
        cb()
      },
      protocol: GRAPHQL_TRANSPORT_WS
    },
    {}
  )

  sc.isReady = true
  await sc.handleMessage(
    JSON.stringify({
      id: 1,
      type: 'subscribe',
      payload: {
        query: 'query { __typename }'
      }
    })
  )
})

test('subscription connection handles query when fullWsTransport: true', async (t) => {
  const send = sinon.stub().callsFake((message, cb) => {
    cb()
  })

  const sc = new SubscriptionConnection(
    {
      on () {},
      send,
      protocol: GRAPHQL_TRANSPORT_WS
    },
    {
      fastify: {
        graphql: () => {
          return {}
        }
      },
      fullWsTransport: true
    }
  )

  sc.isReady = true

  await sc.handleMessage(
    JSON.stringify({
      id: 1,
      type: 'subscribe',
      payload: {
        query: 'query { __typename }'
      }
    })
  )

  await immediate()

  sinon.assert.calledTwice(send)
  sinon.assert.calledWith(send, JSON.stringify({
    type: 'next',
    id: 1,
    payload: {}
  }))
  sinon.assert.calledWith(send, JSON.stringify({
    type: 'complete',
    id: 1,
    payload: null
  }))
})

test('subscription connection handles mutation when fullWsTransport: true', async (t) => {
  const send = sinon.stub().callsFake((message, cb) => {
    cb()
  })

  const sc = new SubscriptionConnection(
    {
      on () {},
      send,
      protocol: GRAPHQL_TRANSPORT_WS
    },
    {
      fastify: {
        graphql: () => {
          return {}
        }
      },
      fullWsTransport: true
    }
  )

  sc.isReady = true

  await immediate()

  await sc.handleMessage(
    JSON.stringify({
      id: 1,
      type: 'subscribe',
      payload: {
        query: 'mutation { __typename }'
      }
    })
  )

  await immediate()

  sinon.assert.calledTwice(send)
  sinon.assert.calledWith(send, JSON.stringify({
    type: 'next',
    id: 1,
    payload: {}
  }))
  sinon.assert.calledWith(send, JSON.stringify({
    type: 'complete',
    id: 1,
    payload: null
  }))
})

test('subscription data is released right after it ends', async (t) => {
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (msg, cb) { cb() },
    protocol: GRAPHQL_TRANSPORT_WS
  }, {
    context: { preSubscriptionParsing: null, preSubscriptionExecution: null },
    fastify: {
      graphql: {
        schema: makeExecutableSchema({
          typeDefs: ['type Query { blah: String! }', 'type Subscription { onMessage: String! }'],
          resolvers: {
            Query: {},
            Subscription: {
              onMessage: {
                async * subscribe () {
                  return 'blah'
                }
              }
            }
          }
        })
      }
    }
  })

  sc.isReady = true

  t.assert.strictEqual(sc.subscriptionIters.size, 0)
  t.assert.strictEqual(sc.subscriptionContexts.size, 0)

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'subscribe',
    payload: {
      query: 'subscription { onMessage } '
    }
  }))

  await new Promise(resolve => {
    sc.sendMessage = (type, id, payload) => {
      t.assert.strictEqual(id, 1)
      t.assert.strictEqual(type, 'complete')
      t.assert.strictEqual(payload, null)

      t.assert.strictEqual(sc.subscriptionIters.size, 1)
      t.assert.strictEqual(sc.subscriptionContexts.size, 1)

      resolve()
    }
  })

  await immediate()

  t.assert.strictEqual(sc.subscriptionIters.size, 0)
  t.assert.strictEqual(sc.subscriptionContexts.size, 0)
})

test('should use default protocol when client does not specify a subprotocol', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  app.register(mercurius, {
    schema: `
      type Query {
        _placeholder: String
      }

      type Subscription {
        onMessage: String!
      }
    `,
    resolvers: {
      Query: {},
      Subscription: {
        onMessage: {
          async * subscribe () {
            yield { onMessage: 'hello' }
          }
        }
      }
    },
    subscription: {
      wsDefaultSubprotocol: 'graphql-ws'
    }
  })

  await app.listen({ port: 0 })
  const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'

  const ws = new WebSocket(url) // no subprotocol

  ws.on('error', (error) => {
    assert.fail('must not error ' + error)
  })

  await once(ws, 'open')
  ws.send(JSON.stringify({ type: 'connection_init' }))
  ws.send(JSON.stringify({
    type: 'start',
    payload: {
      query: 'subscription { onMessage }'
    }
  }))

  let receivedData
  for await (const [message] of on(ws, 'message')) {
    const data = JSON.parse(message.toString())
    if (data.type === 'connection_ack') {
      continue
    }
    if (data.type === 'data') {
      receivedData = true
      assert.equal(data.payload.data.onMessage, 'hello')
      break
    }
  }

  assert.equal(receivedData, true, 'must receive data message')

  ws.close()
})
