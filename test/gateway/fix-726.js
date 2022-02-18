'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

const users = {
  1: {
    id: 1,
    name: 'John',
    username: '@john'
  },
  2: {
    id: 2,
    name: 'Jane',
    username: '@jane'
  }
}

async function buildService () {
  const app = Fastify()
  const schema = `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
    }
  `

  const resolvers = {
    Query: {
      me: () => {
        return users['1']
      }
    }
  }

  const loaders = {
    User: {
      async __resolveReference (queries, { reply }) {
        return queries.map(({ obj }) => users[obj.id])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders,
    federationMetadata: true,
    allowBatchedQueries: true
  })

  return app
}

async function buildServiceExternal () {
  const app = Fastify()
  const schema = `
    extend type Query {
      meWrap: Wrap
      meDirect: User
      meDirectMissing: User
      meList: [User]
      meEmptyList: [User]
    }

    type Wrap {
      user: User
      users: [User]
    }

    type User @key(fields: "id") @extends {
      id: ID! @external
    }
  `

  const resolvers = {
    Query: {
      meWrap: () => {
        return { user: { id: '1' } }
      },
      meDirect: () => {
        return { id: '1', __typename: 'User' }
      },
      meDirectMissing: () => {
        return null
      },
      meList: () => {
        return [
          { id: '1', __typename: 'User' },
          { id: '2', __typename: 'User' }
        ]
      },
      meEmptyList: () => {
        // no users
        return []
      }
    },
    Wrap: {
      users: () => {
        return [
          { id: '1', __typename: 'User' },
          { id: '2', __typename: 'User' }
        ]
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

test('federated node should be able to return external Type directly', async (t) => {
  const port1 = 3027
  const serviceOne = await buildService()
  await serviceOne.listen(port1)
  t.teardown(() => { serviceOne.close() })

  const port2 = 3028
  const serviceTwo = await buildServiceExternal()
  await serviceTwo.listen(port2)
  t.teardown(() => { serviceTwo.close() })

  const serviceProxy = await buildProxy(port1, port2)
  await serviceProxy.ready()
  t.teardown(() => { serviceProxy.close() })

  {
    const res = await serviceProxy.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `{
        meDirect { id name username }
      }`
      }
    })

    t.same(res.json(), {
      data: {
        meDirect: {
          id: '1',
          name: 'John',
          username: '@john'
        }
      }
    })
  }

  {
    const res = await serviceProxy.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: '{ meDirectMissing { id name username } }'
      }
    })

    t.same(res.json(), {
      data: {
        meDirectMissing: null
      }
    })
  }

  {
    const res = await serviceProxy.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `{
        meDirect { id name }
        meWrap { user { name }  }
      }`
      }
    })

    t.same(res.json(), {
      data: {
        meDirect: {
          id: '1',
          name: 'John'
        },
        meWrap: {
          user: {
            name: 'John'
          }
        }
      }
    })
  }
  {
    const res = await serviceProxy.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `{
        meList { id name }
      }`
      }
    })

    t.same(res.json(), {
      data: {
        meList: [{
          id: '1',
          name: 'John'
        }, {
          id: '2',
          name: 'Jane'
        }]
      }
    })
  }

  {
    const res = await serviceProxy.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `{
          meWrap { 
            users {
              id name
            }
          }
        }`
      }
    })

    t.same(res.json(), {
      data: {
        meWrap: {
          users: [{
            id: '1',
            name: 'John'
          }, {
            id: '2',
            name: 'Jane'
          }]
        }
      }
    })
  }

  {
    const res = await serviceProxy.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `{
          meEmptyList { 
            id name
          }
        }`
      }
    })

    t.same(res.json(), {
      data: {
        meEmptyList: []
      }
    })
  }

  {
    const res = await serviceProxy.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query: `{
          meDirect { 
            id 
            ...UserFragment
          }
        }
        
        fragment UserFragment on User {
          name username
        }`
      }
    })

    t.same(res.json(), {
      data: {
        meDirect: {
          id: '1',
          name: 'John',
          username: '@john'
        }
      }
    })
  }
})
