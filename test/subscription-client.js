'use strict'
const { test } = require('tap')
const SubscriptionClient = require('../lib/subscription-client')
const WS = require('ws')

test('subscription client calls the publish method with the correct payload', (t) => {
  const server = new WS.Server({ port: 8888 })
  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'start') {
        ws.send(JSON.stringify({ id: '1', type: 'data', payload: { data: { foo: 'bar' } } }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient('ws://localhost:8888', {
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
  const server = new WS.Server({ port: 8889 })
  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'start') {
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient('ws://localhost:8889', {
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
  let server = new WS.Server({ port: 8890 })
  server.on('connection', function connection (ws) {
    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient('ws://localhost:8890', {
    reconnect: true,
    maxReconnectAttempts: 10,
    serviceName: 'test-service'
  })
  server.close()

  client.createSubscription('query', {}, (data) => {
    t.deepEqual(data, {
      topic: 'test-service_1',
      payload: null
    })
    client.close()
    server.close()
    t.end()
  })

  setTimeout(() => {
    server = new WS.Server({ port: 8890 })
    server.on('connection', function connection (ws) {
      ws.on('message', function incoming (message) {
        const data = JSON.parse(message)
        if (data.type === 'start') {
          ws.send(JSON.stringify({ id: '1', type: 'complete' }))
        }
      })

      ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
    })
  }, 2000)
})

test('subscription client stops trying reconnecting after maxReconnectAttempts', (t) => {
  let server = new WS.Server({ port: 8891 })
  server.on('connection', function connection (ws) {
    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient('ws://localhost:8891', {
    reconnect: true,
    maxReconnectAttempts: 2,
    serviceName: 'test-service'
  })
  server.close()

  client.createSubscription('query', {}, (data) => {
    t.deepEqual(data, {
      topic: 'test-service_1',
      payload: null
    })
  })

  setTimeout(() => {
    server = new WS.Server({ port: 8891 })
    server.on('connection', function connection (ws) {
      throw new Error('Client connected when it should not!')
    })
    client.close()
    server.close()
    t.end()
  }, 2000)
})

test('subscription client multiple subscriptions is handled by one operation', t => {
  const server = new WS.Server({ port: 8892 })
  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'start') {
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient('ws://localhost:8892', {
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

test('subscription client multiple subscriptions unsubscribe removes only ', t => {
  const server = new WS.Server({ port: 8893 })
  server.on('connection', function connection (ws) {
    ws.on('message', function incoming (message) {
      const data = JSON.parse(message)
      if (data.type === 'stop') {
        ws.send(JSON.stringify({ id: '1', type: 'complete' }))
      }
    })

    ws.send(JSON.stringify({ id: undefined, type: 'connection_ack' }))
  })

  const client = new SubscriptionClient('ws://localhost:8893', {
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
