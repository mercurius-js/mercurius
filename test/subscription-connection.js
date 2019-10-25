const { test } = require('tap')
const proxyquire = require('proxyquire')
const websocket = require('websocket-stream')
const fastify = require('fastify')
const mq = require('mqemitter')
const SubscriptionConnection = require('../subscription-connection')
const { PubSub } = require('../subscriber')

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

  const subscription = proxyquire('../subscription', {
    './subscription-connection': MockSubscriptionConnection
  })

  const app = fastify()
  t.tearDown(() => app.close())
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
    const client = websocket(url, 'graphql-ws', {
      objectMode: true
    })
    t.tearDown(client.destroy.bind(client))

    client.on('error', () => {})
    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init_error'
    }))
    client.on('close', () => {
      t.is(handleConnectionCloseCalled, true)
    })
  })
})
