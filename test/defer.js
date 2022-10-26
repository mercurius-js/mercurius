const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('../index')
const { canUseIncrementalExecution } = require('../lib/util')

if (canUseIncrementalExecution) {
  const schema = `
    directive @defer(
      if: Boolean! = true
      label: String
    ) on FRAGMENT_SPREAD | INLINE_FRAGMENT

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

  const wrongAcceptValues = [
    '',
    'application/json',
    'multipart/mixed',
    'multipart/mixed; deferSpec=12345'
  ]

  for (const accept of wrongAcceptValues) {
    test('errors with @defer when used with wrong "accept" header', async t => {
      const app = Fastify()
      await app.register(mercurius, { schema, resolvers, graphiql: true })

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
        body: JSON.stringify({
          data: null,
          errors: [{
            message: "Server received an operation that uses incremental delivery (@defer or @stream), but the client does not accept multipart/mixed HTTP responses. To enable incremental delivery support, add the HTTP header 'Accept: multipart/mixed; deferSpec=20220824'."
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
      await app.register(mercurius, { schema, resolvers, graphiql: true })

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
}
