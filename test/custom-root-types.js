'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const WebSocket = require('ws')
const mq = require('mqemitter')
const GQL = require('..')

test('redefine query', async (t) => {
  const schema = `
    schema {
      query: BetterQuery
    }

    type BetterQuery {
      q: Query
    }

    type Query {
      id: ID!
    }
  `

  const resolvers = {
    BetterQuery: {
      q: async () => ({ id: '1' })
    },

    Query: {
      id: async () => '1'
    }
  }

  const app = Fastify()
  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ q { id } }'
  const result = await app.graphql(query)
  t.same(result, {
    data: {
      q: {
        id: '1'
      }
    }
  })
})

test('redefined mutation type', async (t) => {
  const schema = `
    schema {
      query: Query
      mutation: BetterMutation
    }

    type BetterMutation {
      m: Mutation
    }

    type Mutation {
      name: String!
    }

    type Query {
      mut: Mutation!
    }
  `

  const resolvers = {
    BetterMutation: {
      m: async () => ({ name: 'Bobby' })
    },

    Mutation: {
      name: async () => 'Bobby'
    },

    Query: {
      mut: async () => ({ name: 'Bobby' })
    }
  }

  const app = Fastify()
  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const mutation = 'mutation { m { name } }'
  const res = await app.graphql(mutation)
  t.same(res, {
    data: {
      m: {
        name: 'Bobby'
      }
    }
  })
})

test('redefined subscription type', t => {
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
    schema {
      query: Query,
      mutation: Mutation,
      subscription: BetterSubscription
    }

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

    type BetterSubscription {
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
    BetterSubscription: {
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
