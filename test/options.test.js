'use strict'

const proxyquire = require('proxyquire')
const sinon = require('sinon')
const { test } = require('node:test')
const Fastify = require('fastify')
const { mercurius } = require('../index')

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
  t.after(() => app.close())

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

test('invalid wsDefaultSubprotocol', async t => {
  const app = Fastify()
  t.after(() => app.close())

  app.register(mercurius, {
    subscription: {
      wsDefaultSubprotocol: 'invalid'
    }
  })

  await t.assert.rejects(app.ready(), {
    message: 'Invalid options: wsDefaultSubprotocol must be either graphql-ws or graphql-transport-ws'
  })
})

test('invalid queueHighWaterMark', async t => {
  const app = Fastify()
  t.after(() => app.close())

  app.register(mercurius, {
    subscription: {
      queueHighWaterMark: 'invalid'
    }
  })

  await t.assert.rejects(app.ready(), {
    message: 'Invalid options: queueHighWaterMark must be a positive number'
  })
})

test('invalid queueHighWaterMark', async t => {
  const app = Fastify()
  t.after(() => app.close())

  app.register(mercurius, {
    subscription: {
      queueHighWaterMark: -1
    }
  })

  await t.assert.rejects(app.ready(), {
    message: 'Invalid options: queueHighWaterMark must be a positive number'
  })
})
