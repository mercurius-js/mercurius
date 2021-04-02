'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const WebSocket = require('ws')
const GQL = require('../..')

const users = {
  u1: {
    id: 'u1',
    name: 'John'
  },
  u2: {
    id: 'u2',
    name: 'Jane'
  }
}

const messages = {}

const userSchema = `
extend type Query {
  me: User
}

type User @key(fields: "id") {
  id: ID!
  name: String!
}
`

const messageSchema = `
extend type Mutation {
  sendMessage(message: MessageInput!): Message
}

extend type Subscription {
  newMessage(toUser: ID!): Message
}

type Message @key(fields: "id") {
  id: ID!
  text: String!
  from: User
  to: User
}

extend type User @key(fields: "id") {
  id: ID! @external
  messages: [Message]
}

input MessageInput {
  fromUserId: ID!
  toUserId: ID!
  text: String!
}
`

const userResolvers = {
  Query: {
    me: (root, args, context, info) => {
      return users.u2
    }
  },
  User: {
    __resolveReference: (user, args, context, info) => {
      return users[user.id]
    }
  }
}

const messageResolvers = {
  Mutation: {
    async sendMessage (root, { message }, { pubsub }) {
      const id = Object.values(messages).length + 1

      const result = {
        id,
        ...message
      }

      messages[id] = result

      await pubsub.publish({
        topic: `NEW_MESSAGE_${message.toUserId}`,
        payload: {
          newMessage: result
        }
      })

      return result
    }
  },
  Subscription: {
    newMessage: {
      subscribe: async (root, { toUser }, { pubsub }) => {
        const subscription = await pubsub.subscribe(`NEW_MESSAGE_${toUser}`)

        return subscription
      }
    }
  },
  Message: {
    __resolveReference: (message) => messages[message.id],
    from: (message) => {
      return {
        __typename: 'User',
        id: message.fromUserId
      }
    },
    to: (message) => {
      return {
        __typename: 'User',
        id: message.toUserId
      }
    }
  }
}

test('gateway subscription handling works correctly', t => {
  t.plan(1)
  let userService
  let messageService
  let gateway

  function createUserService (callback) {
    userService = Fastify()
    userService.register(GQL, {
      schema: userSchema,
      resolvers: userResolvers,
      federationMetadata: true,
      subscription: true,
      ide: 'playground'
    })
    userService.listen(0, callback)
  }

  function createMessageService (callback) {
    messageService = Fastify()
    messageService.register(GQL, {
      schema: messageSchema,
      resolvers: messageResolvers,
      federationMetadata: true,
      subscription: true,
      ide: 'playground'
    })
    messageService.listen(0, callback)
  }

  function createGateway (callback) {
    const userServicePort = userService.server.address().port
    const messageServicePort = messageService.server.address().port

    gateway = Fastify()
    gateway.register(GQL, {
      subscription: true,
      ide: 'playground',
      jit: 1,
      gateway: {
        services: [{
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`,
          wsUrl: `ws://localhost:${userServicePort}/graphql`
        }, {
          name: 'message',
          url: `http://localhost:${messageServicePort}/graphql`,
          wsUrl: `ws://localhost:${messageServicePort}/graphql`
        }]
      }
    })

    gateway.listen(0, callback)
  }

  function runSubscription () {
    const ws = new WebSocket(`ws://localhost:${(gateway.server.address()).port}/graphql`, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(async () => {
      client.destroy()
      await gateway.close()
      await messageService.close()
      await userService.close()
    })
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
            newMessage(toUser: "u1") {
              id
              text
              from {
                id
                name
              }
              to {
                id
                name
              }
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
            newMessage(toUser: "u2") {
              id
            }
          }
        `
      }
    }))

    client.write(JSON.stringify({
      id: 2,
      type: 'stop'
    }))

    client.on('data', (chunk) => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.equal(chunk, JSON.stringify({
          type: 'data',
          id: 1,
          payload: {
            data: {
              newMessage: {
                id: '1',
                text: 'Hi there',
                from: {
                  id: 'u2',
                  name: 'Jane'
                },
                to: {
                  id: 'u1',
                  name: 'John'
                }
              }
            }
          }
        }))

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        gateway.inject({
          method: 'POST',
          url: '/graphql',
          body: {
            query: `
              mutation {
                sendMessage(message: {
                  text: "Hi there",
                  fromUserId: "u2",
                  toUserId: "u1"
                }) {
                  id
                }
              }
            `
          }
        })
      }
    })
  }

  const startGateway = createGateway.bind(null, runSubscription)
  const startMessageService = createMessageService.bind(null, startGateway)

  createUserService(startMessageService)
})

test('gateway wsConnectionParams object is passed to SubscriptionClient', t => {
  function onConnect (data) {
    t.same(data.payload, connectionInitPayload)
    t.end()
  }

  const connectionInitPayload = {
    hello: 'world'
  }
  const testService = Fastify()

  testService.register(GQL, {
    schema: `
      type Query {
        test: String
      }
    `,
    federationMetadata: true,
    subscription: { onConnect }
  })

  testService.listen(0, async err => {
    t.error(err)
    const testServicePort = testService.server.address().port

    const gateway = Fastify()
    t.teardown(async () => {
      await gateway.close()
      await testService.close()
    })
    gateway.register(GQL, {
      subscription: true,
      gateway: {
        services: [{
          name: 'test',
          url: `http://localhost:${testServicePort}/graphql`,
          wsUrl: `ws://localhost:${testServicePort}/graphql`,
          wsConnectionParams: {
            connectionInitPayload
          }
        }]
      }
    })
    await gateway.ready()
  })
})

test('gateway wsConnectionParams function is passed to SubscriptionClient', t => {
  function onConnect (data) {
    t.same(data.payload, connectionInitPayload)
    t.end()
  }

  const connectionInitPayload = {
    hello: 'world'
  }
  const testService = Fastify()

  testService.register(GQL, {
    schema: `
      type Query {
        test: String
      }
    `,
    federationMetadata: true,
    subscription: { onConnect }
  })

  testService.listen(0, async err => {
    t.error(err)
    const testServicePort = testService.server.address().port

    const gateway = Fastify()
    t.teardown(async () => {
      await gateway.close()
      await testService.close()
    })
    gateway.register(GQL, {
      subscription: true,
      gateway: {
        services: [{
          name: 'test',
          url: `http://localhost:${testServicePort}/graphql`,
          wsUrl: `ws://localhost:${testServicePort}/graphql`,
          wsConnectionParams: async function () {
            return {
              connectionInitPayload
            }
          }
        }]
      }
    })
    await gateway.ready()
  })
})

test('gateway forwards the connection_init payload to the federated service on gql_start using the connectionInit extension', t => {
  t.plan(3)
  function onConnect (data) {
    if (data && data.payload && Object.entries(data.payload).length) {
      t.same(data.payload, connectionInitPayload)
    }

    return true
  }

  const connectionInitPayload = {
    hello: 'world'
  }
  const testService = Fastify()

  testService.register(GQL, {
    schema: `
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
    `,
    resolvers: {
      Query: {
        notifications: () => []
      },
      Subscription: {
        notificationAdded: {
          subscribe: (root, args, { pubsub, topic, hello }) => {
            t.end()
          }
        }
      }
    },
    federationMetadata: true,
    subscription: { onConnect }
  })

  testService.listen(0, async err => {
    t.error(err)

    const testServicePort = testService.server.address().port

    const gateway = Fastify()
    t.teardown(async () => {
      await gateway.close()
      await testService.close()
    })
    gateway.register(GQL, {
      subscription: true,
      gateway: {
        services: [{
          name: 'test',
          url: `http://localhost:${testServicePort}/graphql`,
          wsUrl: `ws://localhost:${testServicePort}/graphql`
        }]
      }
    })

    gateway.listen(0, async err => {
      t.error(err)
      const ws = new WebSocket(`ws://localhost:${(gateway.server.address()).port}/graphql`, 'graphql-ws')
      const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
      t.teardown(client.destroy.bind(client))
      client.setEncoding('utf8')

      client.write(JSON.stringify({
        type: 'connection_init',
        payload: connectionInitPayload
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
            }
          }))
          client.destroy()
        }
      })
    })
  })
})
