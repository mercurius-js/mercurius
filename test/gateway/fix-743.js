'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function buildService () {
  const app = Fastify()
  const schema = `
    extend type Query {
      list: PageInfo
    }

    type User @key(fields: "id") {
      id: ID!
      name: String
    }
    
    type PageInfo {
      edges: [User]
    }
  `

  const resolvers = {
    Query: {
      list: () => {
        return {
          edges: [
            { id: 1, name: 'Davide' },
            { id: 2, name: 'Fiorello' }
          ]
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true,
    allowBatchedQueries: true
  })

  return app
}

async function buildServiceExternal () {
  const app = Fastify()
  const schema = `
    type PageInfo {
      edges: [User]
    }
    
    type User @key(fields: "id") @extends {
      id: ID! @external
    }
  `

  const resolvers = {
    // Query: {
    //   listx: () => {}
    // }
  }

  app.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true,
    allowBatchedQueries: true
  })

  return app
}

async function buildProxy (port1, port2) {
  const proxy = Fastify()

  proxy.register(GQL, {
    graphiql: true,
    gateway: {
      services: [
        {
          name: 'ext1',
          url: `http://localhost:${port1}/graphql`
        },
        {
          name: 'ext2',
          url: `http://localhost:${port2}/graphql`
        }
      ]
    },
    pollingInterval: 2000
  })

  return proxy
}

test('federated node should be able to return aliased value if the type is declared in multiple places', async (t) => {
  const port1 = 3040
  const serviceOne = await buildService()
  await serviceOne.listen(port1)
  t.teardown(() => { serviceOne.close() })

  const port2 = 3041
  const serviceTwo = await buildServiceExternal()
  await serviceTwo.listen(port2)
  t.teardown(() => { serviceTwo.close() })

  const serviceProxy = await buildProxy(port1, port2)
  await serviceProxy.ready()
  t.teardown(() => { serviceProxy.close() })

  let res = await serviceProxy.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: `{
        list { edges { id name } }
      }`
    }
  })

  t.same(res.json(), {
    data: {
      list: {
        edges: [
          {
            id: '1',
            name: 'Davide'
          },
          {
            id: '2',
            name: 'Fiorello'
          }
        ]
      }
    }
  })

  res = await serviceProxy.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: `{
        list { 
          items: edges { id name }
        }
      }`
    }
  })

  t.same(res.json(), {
    data: {
      list: {
        items: [
          {
            id: '1',
            name: 'Davide'
          },
          {
            id: '2',
            name: 'Fiorello'
          }
        ]
      }
    }
  })
})
