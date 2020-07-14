'use strict'

const { test } = require('tap')
const FakeTimers = require('@sinonjs/fake-timers')

const Fastify = require('fastify')
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
