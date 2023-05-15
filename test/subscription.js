'use strict'
// we test that __proto__ is actually ignored
/* eslint-disable no-proto */

const { test, t } = require('tap')
const Fastify = require('fastify')
const WebSocket = require('ws')
const mq = require('mqemitter')
const { EventEmitter } = require('events')
const fastifyWebsocket = require('@fastify/websocket')
const GQL = require('..')
const { once } = require('events')

const FakeTimers = require('@sinonjs/fake-timers')

t.beforeEach(({ context }) => {
  context.clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })
})

t.afterEach(({ context }) => {
  context.clock.uninstall()
})

test('subscription server replies with connection_ack', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: (parent, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: true
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', chunk => {
      t.equal(chunk, JSON.stringify({
        type: 'connection_ack'
      }))
      client.end()
      t.end()
    })
  })
})

test('subscription server replies with keep alive when enabled', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: (parent, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      keepAlive: 10000
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', chunk => {
      const payload = JSON.parse(chunk)

      // keep alive only comes after the ack
      if (payload.type === 'connection_ack') return

      t.equal(payload.type, 'ka')
      client.end()
      t.end()
    })
  })
})

test('subscription server sends update to subscriptions', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const sendTestQuery = () => {
    app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `
          query {
            notifications {
              id
              message
            }
          }
        `
      }
    }, () => {
      sendTestMutation()
    })
  }

  const sendTestMutation = () => {
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

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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
        subscribe: (root, args, ctx) => {
          return ctx.pubsub.subscribe('NOTIFICATION_ADDED')
        }
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

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World'
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

class CustomPubSub {
  constructor () {
    this.emitter = new EventEmitter()
  }

  async subscribe (topic, queue) {
    const listener = (value) => {
      queue.push(value)
    }

    const close = () => {
      this.emitter.removeListener(topic, listener)
    }

    this.emitter.on(topic, listener)
    queue.close = close
  }

  publish (event, callback) {
    this.emitter.emit(event.topic, event.payload)
    callback()
  }
}

test('subscription with custom pubsub', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const pubsub = new CustomPubSub()

  const sendTestQuery = () => {
    app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `
          query {
            notifications {
              id
              message
            }
          }
        `
      }
    }, () => {
      sendTestMutation()
    })
  }

  const sendTestMutation = () => {
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

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
        await pubsub.emitter.emit('NOTIFICATION_ADDED', { notificationAdded: notification })

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
      pubsub
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World'
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

test('subscription server sends update to subscriptions with custom context', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const sendTestQuery = () => {
    app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `
          query {
            notifications {
              id
              message
            }
          }
        `
      }
    }, () => {
      sendTestMutation()
    })
  }

  const sendTestMutation = () => {
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

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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
        subscribe: (root, args, { pubsub, topic }) => pubsub.subscribe(topic)
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      emitter,
      context: () => ({ topic: 'NOTIFICATION_ADDED' })
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World'
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

test('subscription socket protocol different than graphql-ws, protocol = foobar', t => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  t.teardown(app.close)
  app.register(GQL, {
    schema,
    resolvers,
    subscription: true
  })

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'foobar')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')
    ws.on('close', () => {
      client.end()
      t.end()
    })
  })
})

test('subscription connection is closed if context function throws', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: (parent, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      context: function () {
        throw new Error('kaboom')
      }
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    ws.on('close', () => {
      client.end()
      t.end()
    })
  })
})

test('subscription server sends update to subscriptions with custom async context', t => {
  const app = Fastify()
  t.teardown(async () => {
    await app.close()
  })

  const sendTestQuery = () => {
    app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `
          query {
            notifications {
              id
              message
            }
          }
        `
      }
    }, () => {
      sendTestMutation()
    })
  }

  const sendTestMutation = () => {
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

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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
        subscribe: (root, args, { pubsub, topic }) => pubsub.subscribe(topic)
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      emitter,
      context: async () => {
        await t.context.clock.tickAsync(200)
        return { topic: 'NOTIFICATION_ADDED' }
      }
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World'
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

test('subscription connection is closed if async context function throws', t => {
  const app = Fastify()
  t.teardown(async () => {
    await app.close()
  })

  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: (parent, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      context: async function () {
        await t.context.clock.tickAsync(200)
        throw new Error('kaboom')
      }
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    ws.on('close', () => {
      client.end()
      t.end()
    })
  })
})

test('subscription server sends correct error if execution throws', t => {
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

    type Subscription {
      notificationAdded: Notification
    }
  `

  const resolvers = {
    Subscription: {
      notificationAdded: {
        subscribe: () => {
          throw Error('custom execution error')
        }
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

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'error') {
        t.equal(chunk, JSON.stringify({
          type: 'error',
          id: 1,
          payload: 'custom execution error'
        }))

        client.end()
        t.end()
      }
    })
  })
})

test('subscription server sends correct error if there\'s a graphql error', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const sendTestQuery = () => {
    app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `
          query {
            notifications {
              id
              message
            }
          }
        `
      }
    }, () => {
      sendTestMutation()
    })
  }

  const sendTestMutation = () => {
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

  const emitter = mq()
  const schema = `
    type Notification {
      id: ID!
      message: Int
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

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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
        subscribe: (root, args, ctx) => {
          return ctx.pubsub.subscribe('NOTIFICATION_ADDED')
        }
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

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: null
              }
            },
            errors: [{
              message: 'Int cannot represent non-integer value: "Hello World"',
              locations: [{ line: 5, column: 15 }],
              path: ['notificationAdded', 'message']
            }]
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

test('subscription server exposes pubsub', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const schema = `
  type Notification {
    id: ID!
    message: String
  }

  type Query {
    notifications: [Notification]
  }

  type Subscription {
    notificationAdded: Notification
  }
`
  const notifications = []

  const resolvers = {
    Query: {
      notifications: () => notifications
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
    subscription: true
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
        subscription {
          notificationAdded {
            id
            message
          }
        }
        `
      }
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)
      if (data.type === 'connection_ack') {
        app.graphql.pubsub.publish({
          topic: 'NOTIFICATION_ADDED',
          payload: {
            notificationAdded: {
              id: 1,
              message: 'test'
            }
          }
        })
      } else {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'test'
              }
            }
          }
        }))
        client.end()
        t.end()
      }
    })
  })
})

test('subscription context is extended with onConnect return value if connectionInit extension is defined in gql_start message', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const schema = `
    type Notification {
      id: ID!
      message: String
    }

    type Query {
      notifications: [Notification]
    }

    type Subscription {
      notificationAdded: Notification
    }
  `

  const resolvers = {
    Query: {
      notifications: () => []
    },
    Subscription: {
      notificationAdded: {
        subscribe: (root, args, { pubsub, topic, hello }) => {
          t.equal(hello, 'world')
          t.end()
          pubsub.subscribe(topic)
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      onConnect: () => ({ hello: 'world' })
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.type === 'connection_ack') {
        client.write(JSON.stringify({
          id: 1,
          type: 'start',
          payload: {
            query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
          },
          extensions: [
            { type: 'connectionInit' }
          ]
        }))

        client.end()
      }
    })
  })
})

test('subscription works properly if onConnect is not defined and connectionInit extension is defined in gql_start message', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const schema = `
    type Notification {
      id: ID!
      message: String
    }

    type Query {
      notifications: [Notification]
    }

    type Subscription {
      notificationAdded: Notification
    }
  `

  const resolvers = {
    Query: {
      notifications: () => []
    },
    Subscription: {
      notificationAdded: {
        subscribe: (root, args, { pubsub, topic, hello }) => {
          t.end()
          pubsub.subscribe(topic)
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: true
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.type === 'connection_ack') {
        client.write(JSON.stringify({
          id: 1,
          type: 'start',
          payload: {
            query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
          },
          extensions: [
            { type: 'connectionInit' }
          ]
        }))

        client.end()
      }
    })
  })
})

test('subscription works with `withFilter` tool', t => {
  t.plan(4)
  const app = Fastify()
  t.teardown(() => app.close())

  const { withFilter } = GQL

  let idCount = 0
  const notifications = []

  const schema = `
    type Notification {
      id: ID!
      message: String
    }

    type Query {
      notifications: [Notification]
    }

    type Mutation {
      addNotification(message: String!): Notification!
    }

    type Subscription {
      notificationAdded(contains: String): Notification
    }
  `

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }, { pubsub }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
        await pubsub.publish({
          topic: 'NOTIFICATION_ADDED',
          payload: {
            notificationAdded: notification
          }
        })
      }
    },
    Subscription: {
      notificationAdded: {
        subscribe: withFilter(
          (_, __, { pubsub }) => pubsub.subscribe('NOTIFICATION_ADDED'),
          (payload, { contains }) => {
            if (!contains) return true
            return payload.notificationAdded.message.includes(contains)
          }
        )
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: true
  })
  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
            subscription {
              notificationAdded(contains: "Hello") {
                id
                message
              }
            }
          `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
            subscription {
              notificationAdded {
                id
                message
              }
            }
          `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.ok(!data.payload.data.notificationAdded.message.includes('filtered'))
        client.end()
      } else if (data.id === 2 && data.type === 'complete') {
        app.inject({
          method: 'POST',
          url: '/graphql',
          body: {
            query: `
              mutation {
                addNotification(message: "filtered should not pass") {
                  id
                }
              }
            `
          }
        }, () => { t.pass() })
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
        }, () => { t.pass() })
      }
    })
  })
})

test('subscription handles `withFilter` if filter throws', t => {
  t.plan(4)
  const app = Fastify()
  t.teardown(() => app.close())

  const { withFilter } = GQL

  let idCount = 0
  const notifications = []

  const schema = `
    type Notification {
      id: ID!
      message: String
    }

    type Query {
      notifications: [Notification]
    }

    type Mutation {
      addNotification(message: String!): Notification!
    }

    type Subscription {
      notificationAdded(contains: String): Notification
    }
  `

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }, { pubsub }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
        await pubsub.publish({
          topic: 'NOTIFICATION_ADDED',
          payload: {
            notificationAdded: notification
          }
        })
      }
    },
    Subscription: {
      notificationAdded: {
        subscribe: withFilter(
          (_, __, { pubsub }) => pubsub.subscribe('NOTIFICATION_ADDED'),
          (payload, { contains }) => {
            if (contains && !payload.notificationAdded.message.includes(contains)) {
              throw new Error('fail')
            }
            return true
          }
        )
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: true
  })
  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
            subscription {
              notificationAdded(contains: "Hello") {
                id
                message
              }
            }
          `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
            subscription {
              notificationAdded {
                id
                message
              }
            }
          `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.ok(!data.payload.data.notificationAdded.message.includes('filtered'))
        client.end()
      } else if (data.id === 2 && data.type === 'complete') {
        app.inject({
          method: 'POST',
          url: '/graphql',
          body: {
            query: `
              mutation {
                addNotification(message: "filtered should not pass") {
                  id
                }
              }
            `
          }
        }, () => { t.pass() })
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
        }, () => { t.pass() })
      }
    })
  })
})

test('`withFilter` tool works with async filters', t => {
  t.plan(4)
  const app = Fastify()
  t.teardown(() => app.close())

  const { withFilter } = GQL

  let idCount = 0
  const notifications = []

  const schema = `
    type Notification {
      id: ID!
      message: String
    }

    type Query {
      notifications: [Notification]
    }

    type Mutation {
      addNotification(message: String!): Notification!
    }

    type Subscription {
      notificationAdded(contains: String): Notification
    }
  `

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }, { pubsub }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
        await pubsub.publish({
          topic: 'NOTIFICATION_ADDED',
          payload: {
            notificationAdded: notification
          }
        })
      }
    },
    Subscription: {
      notificationAdded: {
        subscribe: withFilter(
          (_, __, { pubsub }) => pubsub.subscribe('NOTIFICATION_ADDED'),
          async (payload, { contains }) => {
            if (!contains) return true
            return payload.notificationAdded.message.includes(contains)
          }
        )
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: true
  })
  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
            subscription {
              notificationAdded(contains: "Hello") {
                id
                message
              }
            }
          `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
            subscription {
              notificationAdded {
                id
                message
              }
            }
          `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.ok(!data.payload.data.notificationAdded.message.includes('filtered'))
        client.end()
      } else if (data.id === 2 && data.type === 'complete') {
        app.inject({
          method: 'POST',
          url: '/graphql',
          body: {
            query: `
              mutation {
                addNotification(message: "filtered should not pass") {
                  id
                }
              }
            `
          }
        }, () => { t.pass() })
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
        }, () => { t.pass() })
      }
    })
  })
})

test('subscription server works with fastify websocket', t => {
  const app = Fastify()
  t.teardown(() => app.close())
  t.plan(3)

  app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576
    }
  })

  app.register(async function (app) {
    app.get('/fastify-websocket', { websocket: true }, (connection, req) => {
      connection.socket.on('message', message => {
        connection.socket.send('hi from server')
      })
    })
  })

  const sendTestMutation = () => {
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
    })
  }

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

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/fastify-websocket')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    const subscriptionWs = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const subscriptionClient = WebSocket.createWebSocketStream(subscriptionWs, { encoding: 'utf8', objectMode: true })
    t.teardown(subscriptionClient.destroy.bind(subscriptionClient))
    subscriptionClient.setEncoding('utf8')

    client.on('data', chunk => {
      t.equal(chunk, 'hi from server')
      client.end()
    })

    subscriptionClient.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World'
              }
            }
          }
        }))
        subscriptionClient.end()
      } else {
        sendTestMutation()
      }
    })

    client.write('hi from client')

    subscriptionClient.write(JSON.stringify({
      type: 'connection_init'
    }))

    subscriptionClient.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))
  })
})

test('subscription passes context to its loaders', t => {
  const app = Fastify()
  t.teardown(async () => {
    await app.close()
  })

  const sendTestMutation = () => {
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

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const loaders = {
    Notification: {
      message: async (queries, context) => {
        t.ok(context, 'context is not missing')
        const { username } = context
        return queries.map(({ obj }) => `${obj.message} ${username}`)
      }
    }
  }

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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
        subscribe: (root, args, { pubsub, topic }) => pubsub.subscribe(topic)
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders,
    subscription: {
      emitter,
      context: () => ({
        topic: 'NOTIFICATION_ADDED',
        username: 'foobar'
      })
    }
  })

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World foobar'
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestMutation()
      }
    })
  })
})

test('request and reply objects in subscription context', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const sendTestQuery = () => {
    app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `
          query {
            notifications {
              id
              message
            }
          }
        `
      }
    }, () => {
      sendTestMutation()
    })
  }

  const sendTestMutation = () => {
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

  app.decorateRequest('foo', function () { return 'bar' })

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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
        subscribe: (root, args, ctx) => {
          t.ok(ctx.__currentQuery.includes('notificationAdded {'))
          t.equal(ctx.reply.request.foo(), 'bar')
          t.equal(ctx.reply.request.headers.authorization, 'Bearer foobar')
          return ctx.pubsub.subscribe('NOTIFICATION_ADDED')
        }
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

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init',
      payload: {
        headers: {
          authorization: 'Bearer foobar'
        }
      }
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World'
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

test('request and reply objects in subscription context - no headers wrapper', t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const sendTestQuery = () => {
    app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `
          query {
            notifications {
              id
              message
            }
          }
        `
      }
    }, () => {
      sendTestMutation()
    })
  }

  const sendTestMutation = () => {
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

  app.decorateRequest('foo', function () { return 'bar' })

  let idCount = 1
  const notifications = [{
    id: idCount,
    message: 'Notification message'
  }]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
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
        subscribe: (root, args, ctx) => {
          t.equal(ctx.reply.request.foo(), 'bar')
          t.equal(ctx.reply.request.headers.authorization, 'Bearer foobar')
          t.equal(ctx.reply.request.headers.constructor, Object)
          t.equal(ctx.reply.request.headers.__proto__, {}.__proto__)
          return ctx.pubsub.subscribe('NOTIFICATION_ADDED')
        }
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

  app.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init',
      payload: {
        authorization: 'Bearer foobar',
        constructor: 'aaa',
        __proto__: 'bbb'
      }
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'start',
      payload: {
        query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              notificationAdded: {
                id: '1',
                message: 'Hello World'
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

test('wrong messages do not crash the server', async (t) => {
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: async (_, { x, y }) => x + y
    }
  }

  const fastify = Fastify()
  fastify.register(GQL, {
    schema,
    resolvers,
    subscription: true
  })

  await fastify.listen({ port: 0 })

  t.teardown(fastify.close.bind(fastify))

  const ws = new WebSocket(`ws://127.0.0.1:${fastify.server.address().port}/graphql`, 'graphql-ws')

  await once(ws, 'open')
  ws._socket.write(Buffer.from([0xa2, 0x00]))
  await once(ws, 'close')
})
