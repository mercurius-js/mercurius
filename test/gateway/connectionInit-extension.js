'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const WebSocket = require('ws')
const GQL = require('../..')

test('connectionInit extension e2e testing', t => {
  t.plan(9)
  const userContext = { name: 'test-user' }

  function onConnect (data) {
    const { payload } = data
    if (typeof payload.headers === 'object') {
      // 3 different 'dummy' methods for authentication
      if (payload.headers.from === 'gateway' && payload.headers.allowGateway) {
        return { user: userContext }
      } else if (payload.headers.authorize) {
        return { user: userContext }
      } else if (payload.headers.foo) {
        return { user: userContext }
      }
    }

    return false
  }

  const userService = Fastify()
  const notificationService = Fastify()
  const gateway = Fastify()
  t.tearDown(() => {
    userService.close()
    notificationService.close()
    gateway.close()
  })

  let userId = 1
  const users = [
    {
      id: 1,
      name: 'toto'
    }
  ]
  let notificationId = 1
  const notifications = [
    {
      id: 1,
      message: 'test!'
    }
  ]

  userService.register(GQL, {
    schema: `
      type User {
        id: ID!
        name: String
      }

      extend type Query {
        users: [User]
      }

      extend type Mutation {
        addUser(name: String!): User
      }

      extend type Subscription {
        userAdded: User
      }
    `,
    resolvers: {
      Query: {
        users: () => users
      },
      Mutation: {
        addUser: (root, { name }, { pubsub }) => {
          const user = {
            id: ++userId,
            name
          }
          pubsub.publish({
            topic: 'USER_ADDED',
            payload: {
              userAdded: user
            }
          })
        }
      },
      Subscription: {
        userAdded: {
          subscribe: (root, args, { pubsub, user }) => {
            t.equal(user, userContext)
            return pubsub.subscribe('USER_ADDED')
          }
        }
      }
    },
    federationMetadata: true,
    subscription: { onConnect }
  })

  notificationService.register(GQL, {
    schema: `
      type Notification {
        id: ID!
        message: String
      }

      extend type Query {
        notifications: [Notification]
      }

      extend type Mutation {
        addNotification(message: String!): Notification
      }

      extend type Subscription {
        notificationAdded: Notification
      }
    `,
    resolvers: {
      Query: {
        notifications: () => notifications
      },
      Mutation: {
        addNotification: (root, { message }, { pubsub }) => {
          const notification = {
            id: ++notificationId,
            message
          }
          pubsub.publish({
            topic: 'NOTIFICATION_ADDED',
            payload: {
              notificationAdded: notification
            }
          })
        }
      },
      Subscription: {
        notificationAdded: {
          subscribe: (root, args, { pubsub, user }) => {
            t.equal(user, userContext)
            return pubsub.subscribe('NOTIFICATION_ADDED')
          }
        }
      }
    },
    federationMetadata: true,
    subscription: { onConnect }
  })

  Promise.all([
    userService.ready(),
    notificationService.ready(),
    userService.listen(0),
    notificationService.listen(0)
  ]).then(() => {
    gateway.register(GQL, {
      subscription: true,
      gateway: {
        services: [
          {
            name: 'user',
            url: `http://localhost:${(userService.server.address()).port}/graphql`,
            wsUrl: `ws://localhost:${(userService.server.address()).port}/graphql`,
            wsConnectionParams: {
              connectionInitPayload () {
                return {
                  headers: {
                    allowGateway: true,
                    from: 'gateway'
                  }
                }
              }
            }
          },
          {
            name: 'notification',
            url: `http://localhost:${(notificationService.server.address()).port}/graphql`,
            wsUrl: `ws://localhost:${(notificationService.server.address()).port}/graphql`,
            wsConnectionParams: {
              connectionInitPayload () {
                return {
                  headers: {
                    allowGateway: true,
                    from: 'gateway'
                  }
                }
              }
            }
          }
        ]
      }
    })

    gateway.listen(0, err => {
      t.error(err)
      async function addUser () {
        await gateway.inject({
          method: 'POST',
          url: '/graphql',
          body: {
            query: `
              mutation {
                addUser(name: "titi") {
                  id
                }
              }
            `
          }
        })
      }

      async function addNotification () {
        await gateway.inject({
          method: 'POST',
          url: '/graphql',
          body: {
            query: `
              mutation {
                addNotification(message: "test") {
                  id
                }
              }
            `
          }
        })
      }

      const ws1 = new WebSocket(`ws://localhost:${(gateway.server.address()).port}/graphql`, 'graphql-ws')
      const ws2 = new WebSocket(`ws://localhost:${(gateway.server.address()).port}/graphql`, 'graphql-ws')
      const client1 = WebSocket.createWebSocketStream(ws1, { encoding: 'utf8', objectMode: true })
      const client2 = WebSocket.createWebSocketStream(ws2, { encoding: 'utf8', objectMode: true })
      client1.setEncoding('utf8')
      client2.setEncoding('utf8')
      t.tearDown(() => {
        client1.destroy()
        client2.destroy()
      })

      let ready1 = false
      let ready2 = false
      let done1 = false
      let done2 = false
      async function connectionAckCallback (clientNb) {
        if (clientNb === 1) {
          ready1 = true
        } else if (clientNb === 2) {
          ready2 = true
        }

        if (ready1 && ready2) {
          await Promise.all([
            addUser(),
            addNotification()
          ])
        }
      }
      function terminateCallback (clientNb) {
        if (clientNb === 1) {
          done1 = true
        } else if (clientNb === 2) {
          done2 = true
        }

        if (done1 && done2) {
          t.end()
        }
      }

      function makeDataHandler (clientNb) {
        return async function dataHandler (chunk) {
          const data = JSON.parse(chunk)
          switch (data.type) {
            case 'connection_ack':
              t.pass('should ack')
              await connectionAckCallback(clientNb)
              break
            case 'data':
              switch (data.id) {
                case 1:
                  t.deepEqual(data.payload.data, { notificationAdded: { id: '2', message: 'test' } })
                  terminateCallback(clientNb)
                  break
                case 2:
                  t.deepEqual(data.payload.data, { userAdded: { id: '2', name: 'titi' } })
                  break
              }
              break
            case 'connection_error':
              t.fail('should not send connection_error')
              break
            case 'error':
              t.fail('should not send error')
              break
            case 'complete':
              t.fail('should not send complete')
              break
            default:
              t.fail('unknown response')
          }
        }
      }

      client1.write(JSON.stringify({
        type: 'connection_init',
        payload: {
          headers: {
            authorize: true
          }
        }
      }))
      client2.write(JSON.stringify({
        type: 'connection_init',
        payload: {
          headers: {
            foo: 'bar'
          }
        }
      }))

      const messages = [
        {
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
        },
        {
          id: 2,
          type: 'start',
          payload: {
            query: `
            subscription {
              userAdded {
                id
                name
              }
            }
          `
          }
        }
      ]

      for (const message of messages) {
        client1.write(JSON.stringify(message))
        client2.write(JSON.stringify(message))
      }

      client1.on('data', makeDataHandler(1))
      client2.on('data', makeDataHandler(2))
    })
  })
})
