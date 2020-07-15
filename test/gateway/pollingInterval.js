'use strict'

const { test } = require('tap')
const FakeTimers = require('@sinonjs/fake-timers')

const Fastify = require('fastify')
const WebSocket = require('ws')
const buildFederationSchema = require('../../lib/federation')
const GQL = require('../..')

test('Polling schemas', async (t) => {
  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })

  const resolvers = {
    Query: {
      me: (root, args, context, info) => user
    },
    User: {
      __resolveReference: (user, args, context, info) => user
    }
  }

  const user = {
    id: 'u1',
    name: 'John',
    lastName: 'Doe'
  }

  const userService = Fastify()
  const gateway = Fastify()

  userService.register(GQL, {
    schema: `
      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `,
    resolvers: resolvers,
    federationMetadata: true
  })

  await userService.listen(0)

  const userServicePort = userService.server.address().port

  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 2000
    }
  })

  await gateway.listen(0)

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John'
      }
    }
  })

  const res2 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
            lastName
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res2.body), {
    errors: [
      {
        message:
          'Cannot query field "lastName" on type "User". Did you mean "name"?',
        locations: [{ line: 6, column: 13 }]
      }
    ],
    data: null
  })

  userService.graphql.replaceSchema(
    buildFederationSchema(`
      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
        lastName: String!
      }
    `)
  )
  userService.graphql.defineResolvers(resolvers)

  await clock.tickAsync(2000)

  const res3 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
            lastName
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res3.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        lastName: 'Doe'
      }
    }
  })

  await gateway.close()
  await userService.close()
  clock.uninstall()
})

test("Polling schemas (if service is down, schema shouldn't be changed)", async (t) => {
  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })

  const resolvers = {
    Query: {
      me: (root, args, context, info) => user
    },
    User: {
      __resolveReference: (user, args, context, info) => user
    }
  }

  const user = {
    id: 'u1',
    name: 'John',
    lastName: 'Doe'
  }

  const userService = Fastify()
  const gateway = Fastify()

  userService.register(GQL, {
    schema: `
      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `,
    resolvers: resolvers,
    federationMetadata: true
  })

  await userService.listen(0)

  const userServicePort = userService.server.address().port

  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 2000
    }
  })

  await gateway.listen(0)

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John'
      }
    }
  })

  const res2 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
            lastName
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res2.body), {
    errors: [
      {
        message:
          'Cannot query field "lastName" on type "User". Did you mean "name"?',
        locations: [{ line: 6, column: 13 }]
      }
    ],
    data: null
  })

  await userService.close()

  await clock.tickAsync(2000)

  const res3 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
            lastName
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res3.body), {
    errors: [
      {
        message:
          'Cannot query field "lastName" on type "User". Did you mean "name"?',
        locations: [{ line: 6, column: 13 }]
      }
    ],
    data: null
  })

  await gateway.close()
  clock.uninstall()
})

test('Polling schemas (cache should be cleared)', async (t) => {
  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })

  const user = {
    id: 'u1',
    name: 'John',
    lastName: 'Doe'
  }

  const userService = Fastify()
  const gateway = Fastify()

  userService.register(GQL, {
    schema: `
      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `,
    resolvers: {
      Query: {
        me: (root, args, context, info) => user
      },
      User: {
        __resolveReference: (user, args, context, info) => user
      }
    },
    federationMetadata: true
  })

  await userService.listen(0)

  const userServicePort = userService.server.address().port

  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 2000
    }
  })

  await gateway.listen(0)

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John'
      }
    }
  })

  userService.graphql.replaceSchema(
    buildFederationSchema(`
      extend type Query {
        me2: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `)
  )
  userService.graphql.defineResolvers({
    Query: {
      me2: (root, args, context, info) => user
    },
    User: {
      __resolveReference: (user, args, context, info) => user
    }
  })

  await clock.tickAsync(2000)

  const res2 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me {
            id
            name
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res2.body), {
    errors: [
      {
        message: 'Cannot query field "me" on type "Query". Did you mean "me2"?',
        locations: [{ line: 3, column: 11 }]
      }
    ],
    data: null
  })

  const res3 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query MainQuery {
          me2 {
            id
            name
          }
        }
      `
    })
  })

  t.deepEqual(JSON.parse(res3.body), {
    data: {
      me2: {
        id: 'u1',
        name: 'John'
      }
    }
  })

  await gateway.close()
  await userService.close()
  clock.uninstall()
})

test('Polling schemas (subscriptions should be handled)', async (t) => {
  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })

  const user = {
    id: 'u1',
    name: 'John',
    lastName: 'Doe'
  }

  const resolvers = {
    Query: {
      me: (root, args, context, info) => user
    },
    Mutation: {
      triggerUser: async (root, args, { pubsub }) => {
        await pubsub.publish({
          topic: 'UPDATED.USER',
          payload: {
            updatedUser: user
          }
        })

        return true
      }
    },
    Subscription: {
      updatedUser: {
        subscribe: async (root, args, { pubsub }) =>
          pubsub.subscribe('UPDATED.USER')
      }
    },
    User: {
      __resolveReference: (user, args, context, info) => user
    }
  }

  const userService = Fastify()
  const gateway = Fastify()

  t.tearDown(() => {
    userService.close()
    gateway.close()
  })

  userService.register(GQL, {
    schema: `
      extend type Query {
        me: User
      }

      extend type Subscription {
        updatedUser: User
      }

      extend type Mutation {
        triggerUser: Boolean
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `,
    resolvers: resolvers,
    federationMetadata: true,
    subscription: true
  })

  await userService.listen(0)

  const userServicePort = userService.server.address().port

  gateway.register(GQL, {
    subscription: true,
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`,
          wsUrl: `ws://localhost:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 2000
    }
  })

  await gateway.listen(0)

  const ws = new WebSocket(
    `ws://localhost:${gateway.server.address().port}/graphql`,
    'graphql-ws'
  )

  const client = WebSocket.createWebSocketStream(ws, {
    encoding: 'utf8',
    objectMode: true
  })

  t.tearDown(() => {
    client.destroy()
  })

  client.setEncoding('utf8')

  client.write(
    JSON.stringify({
      type: 'connection_init'
    })
  )

  client.write(
    JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            updatedUser {
              id
              name
            }
          }
        `
      }
    })
  )

  const promise = () =>
    new Promise((resolve) => {
      client.on('data', (chunk) => {
        const data = JSON.parse(chunk)

        if (data.type === 'connection_ack') {
          gateway.inject({
            method: 'POST',
            url: '/graphql',
            body: {
              query: `
              mutation {
                triggerUser
              }
            `
            }
          })
        } else if (data.type === 'data' && data.id === 1) {
          const { payload: { data: { updatedUser = {} } = {} } = {} } = data

          t.deepEqual(updatedUser, {
            id: 'u1',
            name: 'John'
          })

          resolve()
        }
      })
    })

  return promise()
    .then(async () => {
      userService.graphql.replaceSchema(
        buildFederationSchema(`
          extend type Query {
            me: User
          }

          extend type Subscription {
            updatedUser: User
          }

          extend type Mutation {
            triggerUser: Boolean
          }

          type User @key(fields: "id") {
            id: ID!
            name: String!
            lastName: String
          }
        `)
      )

      userService.graphql.defineResolvers(resolvers)

      await clock.tickAsync(2000)

      const promise = () =>
        new Promise((resolve) => {
          client.on('data', (chunk) => {
            const data = JSON.parse(chunk)

            if (data.id === 1) {
              const { payload: { data: { updatedUser = {} } = {} } = {} } = data

              t.deepEqual(updatedUser, {
                id: 'u1',
                name: 'John'
              })

              resolve()
            }
          })
        })

      await gateway.inject({
        method: 'POST',
        url: '/graphql',
        body: {
          query: `
              mutation {
                triggerUser
              }
            `
        }
      })

      return promise()
    })
    .then(() => {
      const ws = new WebSocket(
        `ws://localhost:${gateway.server.address().port}/graphql`,
        'graphql-ws'
      )

      const client2 = WebSocket.createWebSocketStream(ws, {
        encoding: 'utf8',
        objectMode: true
      })

      t.tearDown(() => {
        client2.destroy()
      })

      client2.setEncoding('utf8')

      client2.write(
        JSON.stringify({
          type: 'connection_init'
        })
      )

      client2.write(
        JSON.stringify({
          id: 2,
          type: 'start',
          payload: {
            query: `
                subscription {
                  updatedUser {
                    id
                    name
                    lastName
                  }
                }
              `
          }
        })
      )

      const promise = () =>
        new Promise((resolve) => {
          client2.on('data', (chunk) => {
            const data = JSON.parse(chunk)

            if (data.type === 'connection_ack') {
              gateway.inject({
                method: 'POST',
                url: '/graphql',
                body: {
                  query: `
                      mutation {
                        triggerUser
                      }
                    `
                }
              })
            } else if (data.type === 'data' && data.id === 2) {
              const { payload: { data: { updatedUser = {} } = {} } = {} } = data

              t.deepEqual(updatedUser, {
                id: 'u1',
                name: 'John',
                lastName: 'Doe'
              })

              resolve()
            }
          })
        })

      return promise()
    })
    .then(() => {
      clock.uninstall()
    })
})
