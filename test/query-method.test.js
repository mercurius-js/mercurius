'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const mercurius = require('..')

const schema = `
  type Query {
    echo(msg: String): String
  }
  type Mutation {
    setEcho(msg: String): String
  }
`

const resolvers = {
  Query: {
    echo: (_, { msg }) => msg
  },
  Mutation: {
    setEcho: (_, { msg }) => msg
  }
}

function buildApp (opts = {}) {
  const app = Fastify()
  app.register(mercurius, { schema, resolvers, ...opts })
  return app
}

test('QUERY verb executes a regular query', async t => {
  const app = buildApp()

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: { query: '{ echo(msg: "hello") }' }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { data: { echo: 'hello' } })
})

test('QUERY verb supports variables and operationName', async t => {
  const app = buildApp()

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: {
      query: 'query E($msg: String) { echo(msg: $msg) }',
      variables: { msg: 'world' },
      operationName: 'E'
    }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { data: { echo: 'world' } })
})

test('QUERY verb rejects mutations with 405', async t => {
  const app = buildApp()

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: { query: 'mutation { setEcho(msg: "nope") }' }
  })

  t.assert.equal(res.statusCode, 405)
  t.assert.equal(res.json().errors[0].message, 'QUERY requests must not be used for executing mutation operations')
})

test('POST still allows mutations', async t => {
  const app = buildApp()

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: { query: 'mutation { setEcho(msg: "yep") }' }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { data: { setEcho: 'yep' } })
})

test('QUERY verb rejects named mutation selected via operationName with 405', async t => {
  const app = buildApp()

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: {
      query: 'query Q { echo(msg: "q") } mutation M { setEcho(msg: "m") }',
      operationName: 'M'
    }
  })

  t.assert.equal(res.statusCode, 405)
})

test('QUERY verb allows queries among multiple operations', async t => {
  const app = buildApp()

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: {
      query: 'query A { echo(msg: "a") } query B { echo(msg: "b") }',
      operationName: 'B'
    }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { data: { echo: 'b' } })
})

test('QUERY verb rejects batched requests containing a mutation with 405', async t => {
  const app = buildApp({ allowBatchedQueries: true })

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: [
      { query: '{ echo(msg: "ok") }' },
      { query: 'mutation { setEcho(msg: "nope") }' }
    ]
  })

  t.assert.equal(res.statusCode, 405)
})

test('QUERY verb supports batched queries without mutations', async t => {
  const app = buildApp({ allowBatchedQueries: true })

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: [
      { query: '{ echo(msg: "a") }' },
      { query: '{ echo(msg: "b") }' }
    ]
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), [
    { data: { echo: 'a' } },
    { data: { echo: 'b' } }
  ])
})

test('QUERY verb works with persisted queries', async t => {
  const persistedQueryProvider = require('../lib/persistedQueryDefaults').automatic()
  const app = buildApp({ persistedQueryProvider })

  const query = '{ echo(msg: "persisted") }'
  const hash = require('crypto').createHash('sha256').update(query).digest('hex')

  // Register the query
  await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: {
      query,
      extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
    }
  })

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: {
      extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
    }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { data: { echo: 'persisted' } })
})

test('QUERY verb returns validation errors like POST', async t => {
  const app = buildApp()

  const res = await app.inject({
    method: 'QUERY',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    payload: { query: '{ notAField }' }
  })

  t.assert.equal(res.statusCode, 400)
  t.assert.ok(res.json().errors[0].message.includes('Cannot query field'))
})
