const { test } = require('tap')
const Fastify = require('fastify')
const { fetch } = require('undici')
const mercurius = require('../index')

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

const allProducts = new Array(1).fill(0).map((_, index) => ({
  id: `${index}`,
  sku: 'sku'
}))

const resolvers = {
  Query: {
    allProducts: () => {
      return allProducts
    }
  },
  Product: {
    delivery: () => {
      return {
        estimatedDelivery: '25.01.2000',
        fastestDelivery: '25.01.2000'
      }
    }
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

test('errors with @defer when opts.defer is not true', async t => {
  const app = Fastify()
  await app.register(mercurius, { schema, resolvers, graphiql: true })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ query })
  })

  t.match(res, {
    statusCode: 400,
    body: JSON.stringify({
      data: null,
      errors: [{
        message: 'Unknown directive "@defer".', locations: [{ line: 5, column: 23 }]
      }]
    })
  })

  await app.close()
  t.end()
})

test('errors when used with both JIT and @defer', async t => {
  const app = Fastify()

  try {
    await app.register(mercurius, { jit: 1, defer: true })
    t.fail('Should not successfully start the server')
  } catch (ex) {
    t.equal(ex.message, "Invalid options: @defer and JIT can't be used together")
  }

  await app.close()
  t.end()
})

const wrongAcceptValues = [
  '',
  'application/json',
  'multipart/mixed',
  'multipart/mixed; deferSpec=12345'
]

for (const accept of wrongAcceptValues) {
  test('errors with @defer when used with wrong "accept" header', async t => {
    const app = Fastify()
    await app.register(mercurius, { schema, resolvers, graphiql: true, defer: true })

    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        accept
      },
      body: JSON.stringify({ query })
    })

    t.match(res, {
      statusCode: 500,
      body: JSON.stringify({
        data: null,
        errors: [{
          message: 'Server received an operation that uses incremental delivery (@defer or @stream), but the client does not accept multipart/mixed HTTP responses. To enable incremental delivery support, add the HTTP header "Accept: multipart/mixed; deferSpec=20220824".'
        }]
      })
    })

    await app.close()
    t.end()
  })
}

const correctAcceptValues = [
  'multipart/mixed; deferSpec=20220824',
  'multipart/mixed; deferSpec=20220824, application/json',
  'application/json, multipart/mixed; deferSpec=20220824'
]

for (const accept of correctAcceptValues) {
  test('works with @defer when used with correct "accept" header', async t => {
    const app = Fastify()
    await app.register(mercurius, { schema, resolvers, graphiql: true, defer: true })

    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        accept
      },
      body: JSON.stringify({ query })
    })

    t.match(res, {
      statusCode: 200,
      headers: {
        'content-type': 'multipart/mixed; boundary="-"; deferSpec=20220824'
      },
      body: `\r
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
    })

    await app.close()
    t.end()
  })
}

test('returns stream when using undici.fetch with @defer', async t => {
  const app = Fastify()
  await app.register(mercurius, { schema, resolvers, graphiql: true, defer: true })
  const url = await app.listen({ port: 0 })

  const res = await fetch(`${url}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'multipart/mixed; deferSpec=20220824'
    },
    body: JSON.stringify({ query })
  })

  const reader = res.body.getReader()
  const { value } = await reader.read()
  const result = new TextDecoder('utf-8').decode(value)

  t.same(result, `\r
---\r
content-type: application/json; charset=utf-8\r
\r
{"hasNext":true,"data":{"allProducts":[{"delivery":{},"sku":"sku","id":"0"}]}}\r
---\r
content-type: application/json; charset=utf-8\r
\r
{"hasNext":false,"incremental":[{"path":["allProducts",0,"delivery"],"data":{"estimatedDelivery":"25.01.2000","fastestDelivery":"25.01.2000"}}]}\r
-----\r
`)

  t.same(res.status, 200)
  t.same(res.headers.get('content-type'), 'multipart/mixed; boundary="-"; deferSpec=20220824')

  t.teardown(async () => {
    await reader.releaseLock()
    app.close()
    process.exit()
  })

  t.end()
})
