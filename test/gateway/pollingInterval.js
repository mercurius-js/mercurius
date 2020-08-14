'use strict'

const { test } = require('tap')

const FakeTimers = require('@sinonjs/fake-timers')

const { once } = require('events')
const { promisify } = require('util')
const immediate = promisify(setImmediate)

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
  await clock.tickAsync()

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

test('Polling schemas (gateway.polling interval is not a number)', async (t) => {
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
  const gateway = Fastify({
    log: {
      warn () {
        t.pass()
      }
    }
  })

  t.tearDown(async () => {
    await gateway.close()
    await userService.close()
  })

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
      pollingInterval: '2000'
    }
  })

  await gateway.listen(0)
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

  t.tearDown(async () => {
    await gateway.close()
    await userService.close()
  })

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
  await clock.tickAsync()

  const userServicePort = userService.server.address().port

  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 500
    }
  })

  await gateway.listen(0)
  await clock.tickAsync()

  {
    const { body } = await gateway.inject({
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

    await clock.tickAsync()

    t.deepEqual(JSON.parse(body), {
      data: {
        me: {
          id: 'u1',
          name: 'John'
        }
      }
    })
  }

  {
    const { body } = await gateway.inject({
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

    t.deepEqual(JSON.parse(body), {
      errors: [
        {
          message:
            'Cannot query field "lastName" on type "User". Did you mean "name"?',
          locations: [{ line: 6, column: 15 }]
        }
      ],
      data: null
    })
  }

  await userService.close()
  await clock.tickAsync(500)

  {
    const { body } = await gateway.inject({
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

    t.deepEqual(JSON.parse(body), {
      errors: [
        {
          message:
            'Cannot query field "lastName" on type "User". Did you mean "name"?',
          locations: [{ line: 6, column: 15 }]
        }
      ],
      data: null
    })
  }

  clock.uninstall()
})

test('Polling schemas (if service is mandatory, exception should be thrown)', async (t) => {
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
          url: `http://localhost:${userServicePort}/graphql`,
          mandatory: true
        }
      ]
    }
  })

  await gateway.listen(0)

  {
    const { body } = await gateway.inject({
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

    t.deepEqual(JSON.parse(body), {
      data: {
        me: {
          id: 'u1',
          name: 'John'
        }
      }
    })
  }

  {
    const { body } = await gateway.inject({
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

    t.deepEqual(JSON.parse(body), {
      errors: [
        {
          message:
            'Cannot query field "lastName" on type "User". Did you mean "name"?',
          locations: [{ line: 6, column: 15 }]
        }
      ],
      data: null
    })
  }

  gateway.graphql.gateway.close()
  await userService.close()

  t.rejects(async () => {
    await gateway.graphql.gateway.refresh()
  })

  await gateway.close()
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

  t.equal(ws.readyState, WebSocket.CONNECTING)

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

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.equal(data.type, 'connection_ack')

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
  }

  {
    const [chunk] = await once(client, 'data')
    const data = JSON.parse(chunk)
    t.equal(data.type, 'data')
    t.equal(data.id, 1)

    const { payload: { data: { updatedUser = {} } = {} } = {} } = data

    t.deepEqual(updatedUser, {
      id: 'u1',
      name: 'John'
    })
  }

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

  await clock.tickAsync(10000)

  // We need the event loop to actually spin twice to
  // be able to propagate the change
  await immediate()
  await immediate()

  t.deepEqual(Object.keys(gateway.graphql.schema.getType('User').getFields()), [
    'id',
    'name',
    'lastName'
  ])

  // t.equal(ws.readyState, WebSocket.OPEN)

  const ws2 = new WebSocket(
    `ws://localhost:${gateway.server.address().port}/graphql`,
    'graphql-ws'
  )

  t.equal(ws2.readyState, WebSocket.CONNECTING)

  const client2 = WebSocket.createWebSocketStream(ws2, {
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

  {
    const [chunk] = await once(client2, 'data')
    const data = JSON.parse(chunk)
    t.equal(data.type, 'connection_ack')

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
  }

  {
    const [chunk] = await once(client2, 'data')
    const data = JSON.parse(chunk)
    t.equal(data.type, 'data')
    t.equal(data.id, 2)

    const { payload: { data: { updatedUser = {} } = {} } = {} } = data

    t.deepEqual(updatedUser, {
      id: 'u1',
      name: 'John'
    })
  }

  t.equal(ws2.readyState, WebSocket.OPEN)

  clock.uninstall()
})
