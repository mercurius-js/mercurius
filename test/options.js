'use strict'

const proxyquire = require('proxyquire')
const sinon = require('sinon')
const { test } = require('tap')
const Fastify = require('fastify')

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

test('call compileQuery with correct options if compilerOptions specified', async t => {
  const app = Fastify()
  t.teardown(() => app.close())

  const compileQueryStub = sinon.stub()

  const GQL = proxyquire('../index', {
    'graphql-jit': {
      compileQuery: compileQueryStub
    }
  })

  await app.register(GQL, {
    schema,
    resolvers,
    jit: 1,
    compilerOptions: {
      customJSONSerializer: true
    }
  })

  const queryStub = sinon.stub()

  compileQueryStub.returns({
    query: queryStub
  })

  queryStub.resolves({ errors: [] })

  const query = `{
    read {
      name
      password
    }
  }`

  // warm up the jit counter
  await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', super: 'false' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', super: 'false' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  sinon.assert.calledOnceWithExactly(compileQueryStub, sinon.match.any, sinon.match.any, sinon.match.any, { customJSONSerializer: true })
})
