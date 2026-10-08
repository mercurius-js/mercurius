'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { version: graphqlVersion } = require('graphql')
const mercurius = require('../index')

const isGraphql17 = Number(graphqlVersion.split('.')[0]) >= 17
const skip = !isGraphql17 && 'requires graphql@17'

const schema = `
  type Query {
    allProducts: [Product!]!
  }

  type Product {
    delivery: DeliveryEstimates!
    sku: String!
    id: ID!
  }

  type DeliveryEstimates {
    estimatedDelivery: String!
    fastestDelivery: String!
  }`

const resolvers = {
  Query: {
    allProducts: () => [{ id: '0', sku: 'sku' }]
  },
  Product: {
    delivery: () => ({
      estimatedDelivery: '25.01.2000',
      fastestDelivery: '25.01.2000'
    })
  }
}

const query = `
  query deferVariation {
    allProducts {
      delivery {
        ...MyFragment @defer
      }
      sku
      id
    }
  }

  fragment MyFragment on DeliveryEstimates {
    estimatedDelivery
    fastestDelivery
  }
`

const ACCEPT = 'multipart/mixed; deferSpec=20220824'
const CONTENT_TYPE = 'multipart/mixed; boundary="-"; deferSpec=20220824'

const expectedBody = `\r
---\r
content-type: application/json; charset=utf-8\r
\r
{"hasNext":true,"data":{"allProducts":[{"delivery":{},"sku":"sku","id":"0"}]}}\r
---\r
content-type: application/json; charset=utf-8\r
\r
{"hasNext":false,"incremental":[{"path":["allProducts",0,"delivery"],"data":{"estimatedDelivery":"25.01.2000","fastestDelivery":"25.01.2000"}}]}\r
-----\r
`

test('errors with @defer when opts.defer is not true', async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    body: JSON.stringify({ query })
  })

  t.assert.strictEqual(res.statusCode, 400)
  t.assert.deepStrictEqual(res.json(), {
    data: null,
    errors: [{
      message: 'Unknown directive "@defer".',
      locations: [{ line: 5, column: 23 }]
    }]
  })
})

test('errors when opts.defer is used with graphql@16', { skip: isGraphql17 && 'requires graphql@16' }, async t => {
  const app = Fastify()
  t.after(() => app.close())

  await t.assert.rejects(
    async () => { await app.register(mercurius, { schema, resolvers, defer: true }) },
    { message: 'Invalid options: the defer option requires graphql@17' }
  )
})

for (const jit of [1, { minCount: 1 }]) {
  test(`errors when used with both jit: ${JSON.stringify(jit)} and defer`, async t => {
    const app = Fastify()
    t.after(() => app.close())

    await t.assert.rejects(
      async () => { await app.register(mercurius, { schema, resolvers, jit, defer: true }) },
      { message: 'Invalid options: the defer and jit options cannot be used together' }
    )
  })
}

const wrongAcceptValues = [
  undefined,
  'application/json',
  'multipart/mixed',
  'multipart/mixed; deferSpec=12345',
  'multipart/mixed; deferSpec=20220824; q=0'
]

for (const accept of wrongAcceptValues) {
  test(`errors with @defer when used with wrong "accept" header: ${accept}`, { skip }, async t => {
    const app = Fastify()
    t.after(() => app.close())
    await app.register(mercurius, { schema, resolvers, defer: true })

    const headers = { 'content-type': 'application/json' }
    if (accept !== undefined) {
      headers.accept = accept
    }

    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers,
      body: JSON.stringify({ query })
    })

    t.assert.strictEqual(res.statusCode, 406)
    t.assert.deepStrictEqual(res.json(), {
      data: null,
      errors: [{
        message: 'Server received an operation that uses incremental delivery (@defer), but the client does not accept multipart/mixed HTTP responses. To enable incremental delivery support, add the HTTP header "Accept: multipart/mixed; deferSpec=20220824".'
      }]
    })
  })
}

const correctAcceptValues = [
  ACCEPT,
  'multipart/mixed;deferSpec="20220824"',
  'multipart/mixed; deferSpec=20220824, application/json',
  'application/json, multipart/mixed; deferSpec=20220824',
  'application/json;q=0.9, multipart/mixed; q=0.5; deferSpec=20220824'
]

for (const accept of correctAcceptValues) {
  test(`works with @defer when used with correct "accept" header: ${accept}`, { skip }, async t => {
    const app = Fastify()
    t.after(() => app.close())
    await app.register(mercurius, { schema, resolvers, defer: true })

    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'content-type': 'application/json', accept },
      body: JSON.stringify({ query })
    })

    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.headers['content-type'], CONTENT_TYPE)
    t.assert.strictEqual(res.body, expectedBody)
  })
}

test('works with @defer over GET', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers, defer: true })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql',
    query: { query },
    headers: { accept: ACCEPT }
  })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['content-type'], CONTENT_TYPE)
  t.assert.strictEqual(res.body, expectedBody)
})

test('returns a regular JSON response for operations without @defer when defer is enabled', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers, defer: true })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ allProducts { sku } }' })
  })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.match(res.headers['content-type'], /^application\/json/)
  t.assert.deepStrictEqual(res.json(), { data: { allProducts: [{ sku: 'sku' }] } })
})

test('@defer with if: false returns a regular JSON response', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers, defer: true })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ allProducts { id ... @defer(if: false) { sku } } }' })
  })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { data: { allProducts: [{ id: '0', sku: 'sku' }] } })
})

test('streams errors raised in deferred fragments', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, {
    schema: 'type Query { a: String, b: String }',
    resolvers: {
      Query: {
        a: () => 'a',
        b: () => { throw new Error('boom') }
      }
    },
    defer: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    body: JSON.stringify({ query: '{ a ... @defer(label: "B") { b } }' })
  })

  t.assert.strictEqual(res.statusCode, 200)
  const parts = res.body.split('\r\n---').slice(1, -1).map(p => JSON.parse(p.split('\r\n\r\n')[1]))
  t.assert.deepStrictEqual(parts[0], { hasNext: true, data: { a: 'a' } })
  t.assert.strictEqual(parts[1].hasNext, false)
  t.assert.deepStrictEqual(parts[1].incremental[0].data, { b: null })
  t.assert.strictEqual(parts[1].incremental[0].label, 'B')
  t.assert.strictEqual(parts[1].incremental[0].errors[0].message, 'boom')
})

test('keeps the @defer directive after replaceSchema', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers, defer: true })
  await app.ready()

  const { buildSchema } = require('graphql')
  const newSchema = buildSchema(schema)
  app.graphql.replaceSchema(newSchema)
  app.graphql.defineResolvers(resolvers)

  t.assert.ok(app.graphql.schema.getDirective('defer'))

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    body: JSON.stringify({ query })
  })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.body, expectedBody)
})

test('does not duplicate a @defer directive already defined in the schema', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, {
    schema: `directive @defer(if: Boolean! = true, label: String) on FRAGMENT_SPREAD | INLINE_FRAGMENT
${schema}`,
    resolvers,
    defer: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    body: JSON.stringify({ query })
  })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.body, expectedBody)
})

test('errors with @defer in batched queries', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers, defer: true, allowBatchedQueries: true })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    body: JSON.stringify([{ query }, { query: '{ allProducts { sku } }' }])
  })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), [
    { data: null, errors: [{ message: 'Incremental delivery (@defer) is not supported in batched queries' }] },
    { data: { allProducts: [{ sku: 'sku' }] } }
  ])
})

test('app.graphql() returns the incremental results when called without a reply', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers, defer: true })
  await app.ready()

  const { initialResult, subsequentResults } = await app.graphql(query)
  t.assert.deepStrictEqual(JSON.parse(JSON.stringify(initialResult)), {
    data: { allProducts: [{ delivery: {}, sku: 'sku', id: '0' }] },
    hasNext: true
  })

  const rest = []
  for await (const result of subsequentResults) {
    rest.push(JSON.parse(JSON.stringify(result)))
  }
  t.assert.deepStrictEqual(rest, [{
    hasNext: false,
    incremental: [{
      data: { estimatedDelivery: '25.01.2000', fastestDelivery: '25.01.2000' },
      path: ['allProducts', 0, 'delivery']
    }]
  }])
})

test('streams @defer responses over HTTP with fetch', { skip }, async t => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(mercurius, { schema, resolvers, defer: true })
  const url = await app.listen({ port: 0 })

  const res = await fetch(`${url}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    body: JSON.stringify({ query })
  })

  t.assert.strictEqual(res.status, 200)
  t.assert.strictEqual(res.headers.get('content-type'), CONTENT_TYPE)
  t.assert.strictEqual(await res.text(), expectedBody)
})
