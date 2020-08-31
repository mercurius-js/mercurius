'use strict'
const { test } = require('tap')

const FakeTimers = require('@sinonjs/fake-timers')

const SubscriptionClient = require('../lib/subscription-client')
const WS = require('ws')

test('subscription client calls the publish method with the correct payload', (t) => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'start') {
        ws.send(JSON.stringify({ id: '1', type: 'data', payload: { data: { foo: 'bar' } } }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts: 10,
    serviceName: 'test-service'
  })

  client.createSubscription('query', {}, (data) => {
    t.deepEqual(data, {
      topic: 'test-service_1',
      payload: {
        foo: 'bar'
      }
    })
    client.close()
    server.close()
    t.end()
  })
})

test('subscription client calls the publish method with null after GQL_COMPLETE type payload received', (t) => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'start') {
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts: 10,
    serviceName: 'test-service'
  })

  client.createSubscription('query', {}, (data) => {
    t.deepEqual(data, {
      topic: 'test-service_1',
      payload: null
    })
    client.close()
    server.close()
    t.end()
  })
})

test('subscription client tries to reconnect when server closes', (t) => {
  let server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  function createSubscription () {
    client.createSubscription('query', {}, (data) => {
      t.deepEqual(data, {
        topic: 'test-service_1',
        payload: null
      })
      client.close()
      server.close()
      t.end()
    })
  }

  let shouldCloseServer = true

  function connectionCallback () {
    if (shouldCloseServer) {
      server.close()
      shouldCloseServer = false
      server = new WS.Server({ port }, () => {
        createSubscription()
      })
      server.on('connection', function connection (ws) {
        ws.on('message', (message) => {
          const data = JSON.parse(message)
          if (data.type === 'connection_init') {
            ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
          } else if (data.type === 'start') {
            ws.send(JSON.stringify({ id: '1', type: 'complete' }))
          }
        })
      })
    }
  }

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts: 10,
    serviceName: 'test-service',
    connectionCallback
  })
})

test('subscription client stops trying reconnecting after maxReconnectAttempts', (t) => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts: 1,
    serviceName: 'test-service',
    failedReconnectCallback: () => {
      client.close()
      server.close()
      t.end()
    }
  })
  server.close()

  client.createSubscription('query', {}, (data) => {
    t.deepEqual(data, {
      topic: 'test-service_1',
      payload: null
    })
  })
})

test('subscription client multiple subscriptions is handled by one operation', t => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'start') {
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts: 10,
    serviceName: 'test-service'
  })

  function publish (data) {
    client.close()
    server.close()
    t.end()
  }

  client.createSubscription('query', {}, publish)
  client.createSubscription('query', {}, publish)
})

test('subscription client multiple subscriptions unsubscribe removes only one subscription', t => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'stop') {
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts: 10,
    serviceName: 'test-service',
    connectionCallback: () => {
      function publish (data) {
        client.close()
        server.close()
        t.end()
      }

      const operationId1 = client.createSubscription('query', {}, publish)
      const operationId2 = client.createSubscription('query', {}, publish)
      t.equal(operationId1, operationId2)

      client.unsubscribe(operationId1)
      t.equal(client.operationsCount[operationId1], 1)

      client.unsubscribe(operationId1)
    }
  })
})

test('subscription client closes the connection after GQL_CONNECTION_ERROR type payload received', (t) => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'connection_init') {
        ws.send(JSON.stringify({ id: '1', type: 'connection_error' }))
      }
    })

    ws.on('close', function () {
      client.close()
      server.close()
      t.end()
    })
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: false,
    serviceName: 'test-service'
  })
})

test('subscription client connectionInitPayload is correctly passed', (t) => {
  const connectionInitPayload = {
    hello: 'world'
  }
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'connection_init') {
        t.deepEqual(data.payload, connectionInitPayload)
        client.close()
        server.close()
        t.end()
      }
    })
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: false,
    serviceName: 'test-service',
    connectionInitPayload: async function () {
      return connectionInitPayload
    }
  })
})

test('subscription client closes the connection if connectionInitPayload throws', (t) => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('close', function () {
      client.close()
      server.close()
      t.end()
    })
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: false,
    serviceName: 'test-service',
    connectionInitPayload: async function () {
      throw new Error('kaboom')
    }
  })
})

test('subscription client sending empty object payload on connection init', (t) => {
  const server = new WS.Server({ port: 0 })
  const port = server.address().port

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'connection_init') {
        t.deepEqual(data.payload, {})
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const maxReconnectAttempts = 10
  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts,
    serviceName: 'test-service'
  })

  client.createSubscription('query', {}, (data) => {
    client.close()
    server.close()
    t.end()
  })
})

test('subscription client not throwing error on GQL_CONNECTION_KEEP_ALIVE type payload received', (t) => {
  const clock = FakeTimers.createClock()
  const server = new WS.Server({ port: 0 })
  const port = server.address().port
  t.tearDown(() => {
    server.close()
  })

  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'start') {
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))

    clock.setInterval(() => {
      ws.send(JSON.stringify({ type: 'ka' }))
    }, 200)
  })

  const client = new SubscriptionClient(`ws://localhost:${port}`, {
    reconnect: true,
    maxReconnectAttempts: 10,
    serviceName: 'test-service',
    connectionCallback: () => {
      clock.tick(200)
      clock.tick(200)
    }
  })

  client.createSubscription('query', {}, (data) => {
    t.deepEqual(data, {
      topic: 'test-service_1',
      payload: null
    })
    clock.tick(200)
    client.close()
    t.end()
  })
})
