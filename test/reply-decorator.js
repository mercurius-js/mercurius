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

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('reply decorator operationName', async (t) => {
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

  // needed so that graphql is defined
  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('reply decorator set status code to 400 with bad query', async (t) => {
  t.plan(3)

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
    resolvers
  })

  app.setErrorHandler(async function (err, request, reply) {
    t.pass('error handler called')
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
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body)))
})
