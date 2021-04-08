'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createTestService (t, schema, resolvers = {}) {
  const service = Fastify()
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
  })
  await service.listen(0)
  return [service, service.server.address().port]
}

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

async function createTestGatewayServer (t) {
  // User service
  const userServiceSchema = `
  type Query @extends {
    me: User
  }

  type User @key(fields: "id") {
    id: ID!
    name: String!
  }`

  const userServiceResolvers = {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    }
  }
  const [userService, userServicePort] = await createTestService(t, userServiceSchema, userServiceResolvers)

  const gateway = Fastify()

  t.teardown(async () => {
    await gateway.close()
    await userService.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`,
          rewriteHeaders: (headers, context) => {
            t.ok(headers != null, 'Expected `headers` to have been passed in')
            t.ok(context != null, 'Expected `context` to have been passed in')
          }
        }
      ]
    }
  })

  return gateway
}

test('gateway - rewriteHeaders', async (t) => {
  const app = await createTestGatewayServer(t)

  const query = `
    query {
      user: me {
        id
        name
      }
    }`

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      user: {
        id: 'u1',
        name: 'John'
      }
    }
  })
})
