'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('POST new query', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    enableApolloAPQ: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      query: `
        query AddQuery ($x: Int!, $y: Int!) {
            add(x: $x, y: $y)
        }`
    }
  })

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })
})

test('POST new persisted query and error', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    enableApolloAPQ: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '14b859faf7e656329f24f7fdc7a33a3402dbd8b43f4f57364e15e096143927a9'
        }
      }
    }
  })

  t.deepEqual(JSON.parse(res.body), { data: null, errors: [{ message: 'PersistedQueryNotFound' }] })
})

test('POST invalid version persisted query and error', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    enableApolloAPQ: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {
          version: 2,
          magicCode: '123'
        }
      }
    }
  })

  t.deepEqual(JSON.parse(res.body), { data: null, errors: [{ message: 'Persisted Query Version Not Supported' }] })
})

test('POST invalid persisted query and error', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    enableApolloAPQ: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 }
    }
  })

  t.deepEqual(JSON.parse(res.body), { data: null, errors: [{ message: 'Persisted Query Version Not Supported' }] })
})

test('POST persisted query after priming', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    enableApolloAPQ: true
  })

  let res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      query: `
        query AddQuery ($x: Int!, $y: Int!) {
            add(x: $x, y: $y)
        }`
    }
  })

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })

  res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '14b859faf7e656329f24f7fdc7a33a3402dbd8b43f4f57364e15e096143927a9'
        }
      }
    }
  })

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })
})
