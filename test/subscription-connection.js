'use strict'
const { test } = require('tap')
const proxyquire = require('proxyquire')
const WebSocket = require('ws')
const fastify = require('fastify')
const mq = require('mqemitter')
const SubscriptionConnection = require('../lib/subscription-connection')
const { PubSub } = require('../lib/subscriber')

test('socket is closed on unhandled promise rejection in handleMessage', t => {
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
  t.teardown(() => app.close())
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

  app.listen(0, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.on('error', () => {})
    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init_error'
    }))
    ws.on('close', () => {
      t.equal(handleConnectionCloseCalled, true)
    })
  })
})

test('subscription connection sends error message when message is not json string', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    send (message) {
      t.equal(JSON.stringify({
        type: 'error',
        id: null,
        payload: 'Message must be a JSON string'
      }), message)
    }
  }, {})

  await sc.handleMessage('invalid json string')
})

test('subscription connection handles GQL_CONNECTION_TERMINATE message correctly', async (t) => {
  t.plan(1)
  const sc = new SubscriptionConnection({
    on () {},
    close () { t.pass() },
    send (message) {}
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'connection_terminate'
  }))
})

test('subscription connection closes context on GQL_STOP message correctly', async (t) => {
  t.plan(2)
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {}
  }, {})

  sc.subscriptionContexts = new Map()
  sc.subscriptionContexts.set(1, {
    close () {
      t.pass()
    }
  })

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  t.equal(sc.subscriptionContexts.size, 0)
})

test('subscription connection completes resolver iterator on GQL_STOP message correctly', async (t) => {
  t.plan(2)
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {}
  }, {})

  sc.subscriptionIters = new Map()
  sc.subscriptionIters.set(1, {
    return () {
      t.pass()
    }
  })

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  t.equal(sc.subscriptionIters.size, 0)
})

test('handles error in send and closes connection', async t => {
  t.plan(1)

  const sc = new SubscriptionConnection(
    {
      send (message) {
        throw new Error('Socket closed')
      },
      close () {
        t.pass()
      },
      on () {}
    },
    {}
  )

  await sc.sendMessage('foo')
})

test('subscription connection handles GQL_STOP message correctly, with no data', async (t) => {
  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {}
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'stop'
  }))

  t.notOk(sc.subscriptionContexts.get(0))
})

test('subscription connection send error message when GQL_START handler errs', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.equal(JSON.stringify({
        type: 'error',
        id: 1,
        payload: 'handleGQLStart error'
      }), message)
    }
  }, {})

  sc.isReady = true

  sc.handleGQLStart = async (data) => {
    throw new Error('handleGQLStart error')
  }

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'start',
    payload: { }
  }))
})

test('subscription connection send error message when client message type is invalid', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.equal(JSON.stringify({
        type: 'error',
        id: 1,
        payload: 'Invalid payload type'
      }), message)
    }
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'invalid-type',
    payload: { }
  }))
})

test('subscription connection handles GQL_START message correctly, when payload.query is not defined', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.equal(JSON.stringify(
        { type: 'error', id: 1, payload: 'Must provide document.' }
      ), message)
    }
  }, {})

  sc.isReady = true

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'start',
    payload: { }
  }))
})

test('subscription connection handles when GQL_START is called before GQL_INIT', async (t) => {
  t.plan(1)

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.equal(JSON.stringify(
        { type: 'connection_error', payload: { message: 'Connection has not been established yet.' } }
      ), message)
    }
  }, {})

  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'start',
    payload: { }
  }))
})

test('subscription connection extends context with onConnect return value', async (t) => {
  t.plan(3)

  const context = {
    a: 1
  }

  const sc = new SubscriptionConnection({
    on () {},
    close () {},
    send (message) {
      t.equal(JSON.stringify({ type: 'connection_ack' }), message)
    }
  }, {
    context,
    onConnect: function () {
      return { data: true }
    }
  })

  await sc.handleConnectionInit({})
  t.equal(sc.context.data, true)
  t.equal(sc.context.a, 1)
})

test('subscription connection send GQL_ERROR message if connectionInit extension is defined and onConnect returns a falsy value', async (t) => {
  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message) {
      t.sames(JSON.parse(message), {
        id: 1,
        type: 'error',
        payload: 'Forbidden'
      })
    }
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
    type: 'start',
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
    send (message) {}
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
    type: 'start',
    payload: {},
    extensions: [
      { type: 'connectionInit' }
    ]
  }))

  t.notOk(sc.subscriptionContexts.get(0))
})

test('subscription connection send GQL_ERROR on unknown extension', async (t) => {
  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message) {
      t.sames(JSON.parse(message), {
        id: 1,
        type: 'error',
        payload: 'Unknown extension unknown'
      })
    }
  }, { })

  sc.isReady = true
  await sc.handleMessage(JSON.stringify({
    id: 1,
    type: 'start',
    payload: {},
    extensions: [
      { type: 'unknown' }
    ]
  }))

  t.notOk(sc.subscriptionContexts.get(0))
})

test('subscription connection handleConnectionInitExtension returns the onConnect return value', async (t) => {
  const onConnectResult = {
    hello: 'world'
  }
  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message) { }
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

  t.same(res, onConnectResult)
})

test('subscription connection externds the context with the connection_init payload', async (t) => {
  const connectionInitPayload = {
    hello: 'world'
  }
  const sc = new SubscriptionConnection({
    on () { },
    close () { },
    send (message) { }
  }, {})

  await sc.handleConnectionInit({ type: 'connection_init', payload: connectionInitPayload })

  t.same(sc.context._connectionInit, connectionInitPayload)
})
