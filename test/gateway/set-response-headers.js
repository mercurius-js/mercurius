'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createTestService (schema, resolvers = {}, hooks = {}) {
  const service = Fastify()
  service.register(GQL, { schema, resolvers, federationMetadata: true })

  Object.entries(hooks).forEach(([hookName, handler]) => {
    service.addHook(hookName, handler)
  })

  await service.listen({ port: 0 })
  return [service, service.server.address().port]
}

const TEST_USERS = {
  u1: { id: 'u1', name: 'John' },
  u2: { id: 'u2', name: 'Jane' }
}

// User service
async function createUserService ({ hooks } = {}) {
  const schema = `
  type Query @extends {
    me: User
  }

  type User @key(fields: "id") {
    id: ID!
    name: String!
  }`

  const resolvers = {
    Query: {
      me: () => TEST_USERS.u1
    }
  }

  return createTestService(schema, resolvers, hooks)
}

test('gateway - service setResponseHeaders', async (t) => {
  t.test('setResponseHeaders is called as expected', async (t) => {
    t.plan(2)

    const [users, usersPort] = await createUserService()

    const gateway = Fastify()
    t.teardown(async () => {
      await gateway.close()
      await users.close()
    })

    const setResponseHeaders = (reply) => {
      reply.header('abc', 'abc')
    }

    const url = `http://localhost:${usersPort}/graphql`
    gateway.register(GQL, { gateway: { services: [{ name: 'user', url, setResponseHeaders }] } })

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query: 'query { user: me { id name } }' })
    })

    const expected = { data: { user: { id: 'u1', name: 'John' } } }
    t.has(res.headers, { abc: 'abc' })
    t.same(expected, JSON.parse(res.body))
  })
})
