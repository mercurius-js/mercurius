'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('reply decorator', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  t.teardown(app.close.bind(app))

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  app.get('/', async function (req, reply) {
    const query = '{ add(x: 2, y: 2) }'
    return reply.graphql(query)
  })

  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('reply decorator operationName', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))
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
    resolvers
  })

  app.get('/', async function (req, reply) {
    const query = `
      query MyQuery ($x: Int!, $y: Int!) {
        add(x: $x, y: $y)
      }

      query Double ($x: Int!) {
        add(x: $x, y: $x)
      }
    `
    return reply.graphql(query, null, {
      x: 2,
      y: 1 // useless but we need it verify we call Double
    }, 'Double')
  })

  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('reply decorator set status code to 400 with bad query', async (t) => {
  t.plan(3)

  const app = Fastify()
  t.teardown(app.close.bind(app))
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
    resolvers
  })

  app.setErrorHandler(async function (err, request, reply) {
    reply.code(err.statusCode)
    t.equal(err.statusCode, 400)
    return { errors: err.errors }
  })

  app.get('/', function (req, reply) {
    const query = '{ add(x: 2, y: 2)'
    return reply.graphql(query)
  })

  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  t.equal(res.statusCode, 400)
  t.same(res.json(), {
    errors: [
      {
        message: 'Syntax Error: Expected Name, found <EOF>.',
        locations: [
          {
            line: 1,
            column: 18
          }
        ]
      }
    ]

  })
})

test('reply decorator supports encapsulation when loaders are defined in parent object', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))
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
    loaders: {}
  })

  app.register(async (app) => {
    const schema = `
      type Query {
        multiply(x: Int, y: Int): Int
      }
    `
    const resolvers = {
      multiply: async ({ x, y }) => x * y
    }

    app.register(GQL, {
      schema,
      resolvers,
      prefix: '/prefix'
    })
  })

  const res = await app.inject({
    method: 'POST',
    url: '/prefix/graphql',
    payload: {
      query: '{ multiply(x: 5, y: 5) }'
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), {
    data: {
      multiply: 25
    }
  })

  t.same(res.json(), {
    data: {
      multiply: 25
    }
  })
})
