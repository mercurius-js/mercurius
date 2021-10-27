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

  await service.listen(0)
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

test('gateway - service rewriteHeaders', async (t) => {
  t.test('rewriteHeaders is called as expected', async (t) => {
    t.plan(5)

    const [users, usersPort] = await createUserService()

    const gateway = Fastify()
    t.teardown(async () => {
      await gateway.close()
      await users.close()
    })

    const rewriteHeaders = (headers, context = 'not-passed') => {
      t.ok(headers != null, 'Headers is never undefined/null')

      // `context` isn't available from `getRemoteSchemaDefinition`
      // as such assert it's 'not-passed' OR includes `app` exact instance
      t.ok(context === 'not-passed' || context.app === gateway)
    }

    const url = `http://localhost:${usersPort}/graphql`
    gateway.register(GQL, { gateway: { services: [{ name: 'user', url, rewriteHeaders }] } })

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query: 'query { user: me { id name } }' })
    })

    const expected = { data: { user: { id: 'u1', name: 'John' } } }
    t.same(expected, JSON.parse(res.body))
  })

  t.test('returned headers are sent to graphql service', async (t) => {
    t.plan(3)

    const custom = `Testing-${Math.trunc(Math.random() * 100)}`
    const onRequest = async (req) => {
      t.ok(req.headers['x-custom'] === custom)
    }

    const [users, usersPort] = await createUserService({ hooks: { onRequest } })

    const gateway = Fastify()
    t.teardown(async () => {
      await gateway.close()
      await users.close()
    })

    const rewriteHeaders = () => ({ 'x-custom': custom })
    const url = `http://localhost:${usersPort}/graphql`
    gateway.register(GQL, { gateway: { services: [{ name: 'user', url, rewriteHeaders }] } })

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query: 'query { user: me { id name } }' })
    })

    const expected = { data: { user: { id: 'u1', name: 'John' } } }
    t.same(expected, JSON.parse(res.body))
  })
})
