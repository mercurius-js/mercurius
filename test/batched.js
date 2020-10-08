'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('POST regular query', async (t) => {
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
    allowBatchedQueries: true
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

test('POST single batched query', async (t) => {
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
    allowBatchedQueries: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'AddQuery',
        variables: { x: 1, y: 2 },
        query: `
            query AddQuery ($x: Int!, $y: Int!) {
                add(x: $x, y: $y)
            }`
      }
    ]
  })

  t.deepEqual(JSON.parse(res.body), [{ data: { add: 3 } }])
})

test('POST single bad batched query', async (t) => {
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
    allowBatchedQueries: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'AddQuery',
        variables: { x: 1, y: 2 },
        query: `
            query AddQuery ($x: Int!`
      }
    ]
  })

  t.deepEqual(JSON.parse(res.body), [{ data: null, errors: [{ message: 'Syntax Error: Expected "$", found <EOF>.', locations: [{ line: 2, column: 37 }] }] }])
})

test('POST batched query', async (t) => {
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
    allowBatchedQueries: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'AddQuery',
        variables: { x: 1, y: 2 },
        query: `
            query AddQuery ($x: Int!, $y: Int!) {
                add(x: $x, y: $y)
            }`
      },
      {
        operationName: 'DoubleQuery',
        variables: { x: 1 },
        query: `
            query DoubleQuery ($x: Int!) {
                add(x: $x, y: $x)
            }`
      }
    ]
  })

  t.deepEqual(JSON.parse(res.body), [{ data: { add: 3 } }, { data: { add: 2 } }])
})

test('POST good and bad batched query', async (t) => {
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
    allowBatchedQueries: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'AddQuery',
        variables: { x: 1, y: 2 },
        query: `
            query AddQuery ($x: Int!, $y: Int!) {
                add(x: $x, y: $y)
            }`
      },
      {
        operationName: 'DoubleQuery',
        variables: { x: 1 },
        query: 'query DoubleQuery ('
      }
    ]
  })

  t.deepEqual(JSON.parse(res.body), [{ data: { add: 3 } }, { data: null, errors: [{ message: 'Syntax Error: Expected "$", found <EOF>.', locations: [{ line: 1, column: 20 }] }] }])
})

test('POST batched query with a resolver which succeeds and a resolver which throws', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
        bad: Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y,
    bad: () => { throw new Error('Bad Resolver') }
  }

  app.register(GQL, {
    schema,
    resolvers,
    allowBatchedQueries: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'AddQuery',
        variables: { x: 1, y: 2 },
        query: `
            query AddQuery ($x: Int!, $y: Int!) {
                add(x: $x, y: $y)
            }`
      },
      {
        operationName: 'BadQuery',
        variables: { x: 1 },
        query: `
            query BadQuery {
                bad
            }`
      }
    ]
  })

  t.deepEqual(JSON.parse(res.body), [{ data: { add: 3 } }, { data: { bad: null }, errors: [{ message: 'Bad Resolver', locations: [{ line: 3, column: 17 }], path: ['bad'] }] }])
})

test('POST batched query with a resolver which succeeds and a resolver which throws, with a custom error formatter', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
        bad: Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y,
    bad: () => { throw new Error('Bad Resolver') }
  }

  app.register(GQL, {
    schema,
    resolvers,
    allowBatchedQueries: true,
    errorFormatter: () => ({
      response: {
        data: null,
        errors: [{ message: 'Internal Server Error' }]
      }
    })
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'AddQuery',
        variables: { x: 1, y: 2 },
        query: `
            query AddQuery ($x: Int!, $y: Int!) {
                add(x: $x, y: $y)
            }`
      },
      {
        operationName: 'BadQuery',
        variables: { x: 1 },
        query: `
            query BadQuery {
                bad
            }`
      }
    ]
  })

  t.deepEqual(JSON.parse(res.body), [{ data: { add: 3 } }, { data: null, errors: [{ message: 'Internal Server Error' }] }])
})
