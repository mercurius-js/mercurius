'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')
const GQL = require('..')
const { GraphQLError } = require('graphql-jit/dist/error')

const schema = `
type User {
  name: String!
  password: String!
}

type Query {
  read: [User]
}
`

const resolvers = {
  Query: {
    read: async (_, obj) => {
      return [
        {
          name: 'foo',
          password: 'bar'
        }
      ]
    }
  }
}

test('cache skipped when the GQL Schema has been changed', async t => {
  t.plan(4)

  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(GQL, {
    schema,
    resolvers,
    jit: 1
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    if (context.reply.request.headers.super === 'true') {
      return
    }

    const documentClone = JSON.parse(JSON.stringify(document))
    documentClone.definitions[0].selectionSet.selections[0].selectionSet.selections =
    document.definitions[0].selectionSet.selections[0].selectionSet.selections.filter(sel => sel.name.value !== 'password')

    return {
      document: documentClone
    }
  })

  const query = `{
    read {
      name
      password
    }
  }`

  await superUserCall('this call warm up the jit counter')
  await superUserCall('this call triggers the jit cache')

  {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', super: 'false' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
    t.same(res.json(), {
      data: {
        read: [
          {
            name: 'foo'
          }
        ]
      }
    }, 'this query should not use the cached query')
  }

  await superUserCall('this call must use the cache')

  async function superUserCall (msg) {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', super: 'true' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
    t.same(res.json(), {
      data: {
        read: [
          {
            name: 'foo',
            password: 'bar'
          }
        ]
      }
    }, msg)
  }
})

const GQLMock = proxyquire('../index', {
  'graphql-jit': {
    compileQuery: () => new GraphQLError('compileQuery stub')
  }
})

test('cache skipped when no jit response', async t => {
  t.plan(1)

  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(GQLMock, {
    schema,
    resolvers,
    jit: 1
  })

  const query = `{
    read {
      name
      password
    }
  }`

  {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', super: 'false' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
    t.same(res.json(), {
      data: {
        read: [
          {
            name: 'foo',
            password: 'bar'
          }
        ]
      }
    }, 'this query should not use the cached query')
  }
})
