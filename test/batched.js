'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const sinon = require('sinon')
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

  t.same(JSON.parse(res.body), { data: { add: 3 } })
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

  t.same(JSON.parse(res.body), [{ data: { add: 3 } }])
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

  t.same(JSON.parse(res.body), [{ data: null, errors: [{ message: 'Syntax Error: Expected "$", found <EOF>.', locations: [{ line: 2, column: 37 }] }] }])
})

test('POST single bad batched query with cutom error formatter and custom async context', async (t) => {
  t.plan(2)

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
    allowBatchedQueries: true,
    context: async () => {
      return { topic: 'NOTIFICATIONS_ADDED' }
    },
    errorFormatter: (_execution, context) => {
      t.has(context, { topic: 'NOTIFICATIONS_ADDED' })
      return {
        response: {
          data: null,
          errors: [{ message: 'Internal Server Error' }]
        }
      }
    }
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

  t.same(JSON.parse(res.body), [{ data: null, errors: [{ message: 'Internal Server Error' }] }])
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

  t.same(JSON.parse(res.body), [{ data: { add: 3 } }, { data: { add: 2 } }])
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

  t.same(JSON.parse(res.body), [{ data: { add: 3 } }, { data: null, errors: [{ message: 'Syntax Error: Expected "$", found <EOF>.', locations: [{ line: 1, column: 20 }] }] }])
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

  t.same(JSON.parse(res.body), [{ data: { add: 3 } }, { data: { bad: null }, errors: [{ message: 'Bad Resolver', locations: [{ line: 3, column: 17 }], path: ['bad'] }] }])
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

  t.same(JSON.parse(res.body), [{ data: { add: 3 } }, { data: null, errors: [{ message: 'Internal Server Error' }] }])
})

test('POST batched query has an individual context for each operation', async (t) => {
  const app = Fastify()

  const contextSpy = sinon.spy()

  const schema = `
      type Query {
        test: String
      }
    `

  const resolvers = {
    test: (_, ctx) => contextSpy(ctx.operationId, ctx.operationsCount, ctx.__currentQuery)
  }

  app.register(GQL, {
    schema,
    resolvers,
    allowBatchedQueries: true
  })

  await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'TestQuery',
        query: 'query TestQuery { test }'
      },
      {
        operationName: 'DoubleQuery',
        query: 'query DoubleQuery { test }'
      }
    ]
  })

  sinon.assert.calledTwice(contextSpy)
  sinon.assert.calledWith(contextSpy, 0, 2, sinon.match(/TestQuery/))
  sinon.assert.calledWith(contextSpy, 1, 2, sinon.match(/DoubleQuery/))
})

test('POST batched query respects custom class-based context', async (t) => {
  const app = Fastify()

  const schema = `
    type Query {
      test: String
    }
  `

  class CustomContext {
    constructor () {
      this.test = 'custom'
    }

    method () {
      return this.test
    }
  }

  const resolvers = {
    test: async (args, ctx) => {
      t.type(ctx, 'object')
      t.type(ctx.reply, 'object')
      t.type(ctx.app, 'object')
      t.type(ctx.method, 'function')
      t.equal(ctx.test, 'custom')
      t.equal(ctx.method(), 'custom')
      t.equal(ctx.constructor, CustomContext)
      return ctx.method()
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    context: (request, reply) => {
      t.type(request, 'object')
      t.type(reply, 'object')
      return new CustomContext()
    },
    allowBatchedQueries: true
  })

  const post = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'TestQuery',
        query: 'query TestQuery { test }'
      },
      {
        operationName: 'DoubleQuery',
        query: 'query DoubleQuery { test }'
      }
    ]
  })

  t.same(JSON.parse(post.body), [
    {
      data: {
        test: 'custom'
      }
    }, {
      data: {
        test: 'custom'
      }
    }
  ])
})
