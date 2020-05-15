'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const querystring = require('querystring')
const WebSocket = require('ws')
const { GraphQLError } = require('graphql')
const GQL = require('..')

test('POST route', async (t) => {
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

  const query = '{ add(x: 2, y: 2) }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('POST route application/graphql', async (t) => {
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

  const query = '{ add(x: 2, y: 2) }'

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/graphql' },
    url: '/graphql',
    body: query
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('custom route', async (t) => {
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
    path: '/custom'
  })

  const query = '{ add(x: 2, y: 2) }'

  const res = await app.inject({
    method: 'POST',
    url: '/custom',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('GET route', async (t) => {
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

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}'
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('GET route with variables', async (t) => {
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

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'
  const res = await app.inject({
    method: 'GET',
    url: `/graphql?query=${query}&variables=${JSON.stringify({ x: 2, y: 2 })}`
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('GET route with bad JSON variables', async (t) => {
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

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'

  const res = await app.inject({
    method: 'GET',
    url: `/graphql?query=${query}&variables=notajson`
  })

  t.is(res.statusCode, 400)
})

test('GET route with missing variables', async (t) => {
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

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'

  const res = await app.inject({
    method: 'GET',
    url: `/graphql?query=${query}&variables=${JSON.stringify({ x: 5 })}`
  })

  t.is(res.statusCode, 400)
})

test('GET route with mistyped variables', async (t) => {
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

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'

  const res = await app.inject({
    method: 'GET',
    url: `/graphql?query=${query}&variables=${JSON.stringify({ x: 5, y: 'wrong data' })}`
  })

  t.is(res.statusCode, 400)
})

test('POST route variables', async (t) => {
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

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query,
      variables: {
        x: 2,
        y: 2
      }
    }
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('POST route operationName', async (t) => {
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

  const query = `
    query MyQuery ($x: Int!, $y: Int!) {
      add(x: $x, y: $y)
    }

    query Double ($x: Int!) {
      add(x: $x, y: $x)
    }
  `

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query,
      variables: {
        x: 2,
        y: 1
      },
      operationName: 'Double'
    }
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('GET route variables', async (t) => {
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

  const query = querystring.stringify({
    query: 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
    variables: JSON.stringify({
      x: 2,
      y: 2
    })
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?' + query
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('disable routes', async (t) => {
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
    routes: false
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}'
  })

  t.deepEqual(res.statusCode, 404)
})

test('GET return 200 on resolver error', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => { throw new Error('this is a dummy error') }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}'
  })

  t.equal(res.statusCode, 200)
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))
})

test('POST return 200 on resolver error', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => { throw new Error('this is a dummy error') }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const query = '{add(x:2,y:2)}'
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))
})

test('POST return 400 on error', async (t) => {
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

  const query = '{ add(x: 2, y: 2)'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400) // Bad Request
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))
})

test('POST return 500 on error without statusCode', async (t) => {
  const app = Fastify()
  const schema = `
    interface Event {
      Id: Int!
    }
    type CustomEvent implements Event {
      # Id needs to be specified here
      Name: String!
    }
    type Query {
      listEvent: [Event]
    }
  `

  const resolvers = {
    listEvent: async () => []
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const query = '{ listEvent { id } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 500) // Internal error
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))
})

test('mutation with POST', async (t) => {
  const app = Fastify()
  const schema = `
    type Mutation {
      setMessage(message: String): String
    }

    type Query {
      getMessage: String
    }
  `

  let msg = 'hello'
  const resolvers = {
    setMessage: async ({ message }) => {
      msg = message
      return message
    },
    async getMessage () { return msg }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const query = 'mutation { setMessage(message: "hello world") }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      setMessage: 'hello world'
    }
  })
  t.equal(msg, 'hello world')
})

test('mutation with POST application/graphql', async (t) => {
  const app = Fastify()
  const schema = `
    type Mutation {
      setMessage(message: String): String
    }

    type Query {
      getMessage: String
    }
  `

  let msg = 'hello'
  const resolvers = {
    setMessage: async ({ message }) => {
      msg = message
      return message
    },
    async getMessage () { return msg }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const query = 'mutation { setMessage(message: "hello world") }'

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/graphql' },
    url: '/graphql',
    body: query
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      setMessage: 'hello world'
    }
  })
  t.equal(msg, 'hello world')
})

test('mutation with GET errors', async (t) => {
  const app = Fastify()
  const schema = `
    type Mutation {
      setMessage(message: String): String
    }
    type Query {
      getMessage: String
    }
  `

  const resolvers = {
    setMessage: async ({ message }) => t.fail('should never get called')
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const query = querystring.stringify({
    query: 'mutation { setMessage(message: "hello world") }'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?' + query
  })

  t.equal(res.statusCode, 405) // method not allowed
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))
})

test('POST should support null variables', async (t) => {
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

  const query = '{ add(x: 2, y: 2) }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query,
      variables: null
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('JIT', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: async (_, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    jit: 1 // jit for the first operation
  })

  const query = '{ add(x: 2, y: 2) }'

  {
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query
      }
    })

    t.equal(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.body), {
      data: {
        add: 4
      }
    })
  }

  {
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      body: {
        query
      }
    })

    t.equal(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.body), {
      data: {
        add: 4
      }
    })
  }
})

test('error if there are functions defined in the root object', async (t) => {
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
    jit: 1 // jit for the first operation
  })

  try {
    await app.ready()
  } catch (err) {
    t.is(err.message, 'jit is not possible if there are root functions')
  }
})

test('GET graphiql endpoint', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'graphiql'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.strictEqual(res.statusCode, 200)
})

test('GET graphiql endpoint with boolean', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.strictEqual(res.statusCode, 200)

  const res2 = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res2.statusCode, 404)
})

test('GET graphiql endpoint with property priority', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'graphiql',
    graphiql: 'playground',
    routes: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res.statusCode, 200)

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.strictEqual(res2.statusCode, 404)
  t.notStrictEqual(res2.headers.location, '/graphiql.html')
})

test('Disable ide endpoint', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: false
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  const res2 = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res.statusCode, 404)
  t.strictEqual(res2.statusCode, 404)
})

test('Disable ide endpoint by leaving empty', async (t) => {
  const app = Fastify()
  app.register(GQL, {})

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  const res2 = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res.statusCode, 404)
  t.strictEqual(res2.statusCode, 404)
})

test('GET graphiql endpoint with prefix', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'graphiql',
    prefix: '/test-prefix'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/test-prefix/graphiql'
  })

  t.strictEqual(res.statusCode, 200)
})

test('GET graphiql endpoint with prefixed wrapper', async (t) => {
  const app = Fastify()
  app.register(async function (app, opts) {
    app.register(GQL, {
      ide: 'graphiql'
    })
  }, { prefix: '/test-wrapper-prefix' })

  const res = await app.inject({
    method: 'GET',
    url: '/test-wrapper-prefix/graphiql'
  })

  t.strictEqual(res.statusCode, 200)
})

test('GET graphql playground endpoint', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'playground'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res.statusCode, 200)
})

test('GET graphql playground endpoint with prefix', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'playground',
    prefix: '/test-prefix'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/test-prefix/playground'
  })

  t.strictEqual(res.statusCode, 200)
})

test('GET graphql playground endpoint with prefixed wrapper', async (t) => {
  const app = Fastify()
  app.register(async function (app, opts) {
    app.register(GQL, {
      ide: 'playground'
    })
  }, { prefix: '/test-wrapper-prefix' })

  const res = await app.inject({
    method: 'GET',
    url: '/test-wrapper-prefix/playground'
  })

  t.strictEqual(res.statusCode, 200)
})

test('GET graphql endpoint with prefix', async (t) => {
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
    prefix: '/test-prefix'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/test-prefix/graphql?query={add(x:2,y:2)}'
  })

  t.strictEqual(res.statusCode, 200)
})

test('GET graphql endpoint with prefixed wrapper', async (t) => {
  const app = Fastify()

  app.register(async function (app, opts) {
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
  }, { prefix: '/test-wrapper-prefix' })

  const res = await app.inject({
    method: 'GET',
    url: '/test-wrapper-prefix/graphql?query={add(x:2,y:2)}'
  })

  t.strictEqual(res.statusCode, 200)
})

test('Custom error handler', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => t.fail('should never get called')
  }

  function errorHandler (error, req, reply) {
    app.log.error(error)
    reply.code(403)
    reply.send()
  }

  app.register(GQL, {
    schema,
    resolvers,
    errorHandler
  })

  // Invalid query, should throw 400 from fastify-gql but catched by user handler and set to 403
  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:"2",y:2)}'
  })

  t.strictEqual(res.statusCode, 403)
})

test('server should return 200 on graphql errors (if field can be null)', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      hello: String
    }
  `

  app.register(GQL, {
    schema,
    resolvers: {
      Query: {
        hello: () => { throw new GraphQLError('Simple error') }
      }
    }
  })

  const query = `
    query {
      hello
    }
  `

  const response = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: { query }
  })

  t.equal(response.statusCode, 200)
  t.matchSnapshot(JSON.stringify(JSON.parse(response.body), null, 2))
})

test('server should return 500 on graphql errors (if field can not be null)', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      hello: String!
    }
  `

  app.register(GQL, {
    schema,
    resolvers: {
      Query: {
        hello: () => { throw new GraphQLError('Simple error') }
      }
    }
  })

  const query = `
    query {
      hello
    }
  `

  const response = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: { query }
  })

  t.equal(response.statusCode, 500)
  t.matchSnapshot(JSON.stringify(JSON.parse(response.body), null, 2))
})

test('Error handler set to true should not change default behavior', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => t.fail('should never get called')
  }

  app.register(GQL, {
    schema,
    resolvers,
    errorHandler: true
  })

  // Invalid query
  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:"2",y:2)}'
  })

  const expectedResult = {
    errors: [{
      message: 'Expected type Int, found "2".',
      locations: [{
        line: 1,
        column: 8
      }]
    }],
    data: null
  }

  t.strictEqual(res.statusCode, 400)
  t.strictDeepEqual(JSON.parse(res.body), expectedResult)
})

test('Error handler set to false should pass error to higher handler', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => t.fail('should never get called')
  }

  app.register(GQL, {
    schema,
    resolvers,
    errorHandler: false
  })

  app.setErrorHandler((error, req, reply) => {
    app.log.error(error)
    reply.code(403)
    reply.send()
  })

  // Invalid query
  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:"2",y:2)}'
  })

  t.strictEqual(res.statusCode, 403)
})

test('route validation is catched and parsed to graphql error', async (t) => {
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

  // Invalid query
  const res = await app.inject({
    method: 'POST',
    url: '/graphql'
  })

  const expectedResult = { errors: [{ message: 'body should be object' }], data: null }

  t.strictEqual(res.statusCode, 400)
  t.strictDeepEqual(JSON.parse(res.body), expectedResult)
})

test('routes with custom context', async (t) => {
  const app = Fastify()

  const schema = `
    type Query {
      test: String
    }
  `

  const resolvers = {
    test: async (args, ctx) => {
      t.type(ctx, 'object')
      t.type(ctx.reply, 'object')
      t.type(ctx.app, 'object')
      t.equal(ctx.test, 'custom')
      return ctx.test
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    context: (request, reply) => {
      t.type(request, 'object')
      t.type(reply, 'object')
      return {
        test: 'custom'
      }
    }
  })

  const get = await app.inject({
    method: 'GET',
    url: '/graphql?query=query { test }'
  })

  t.deepEqual(JSON.parse(get.body), {
    data: {
      test: 'custom'
    }
  })

  const post = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: 'query { test }'
    }
  })

  t.deepEqual(JSON.parse(post.body), {
    data: {
      test: 'custom'
    }
  })
})

test('connection is not allowed when verifyClient callback called with `false`', t => {
  t.plan(2)
  const app = Fastify()
  t.tearDown(() => app.close())

  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: (parent, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      verifyClient (info, next) {
        if (info.req.headers['x-custom-header'] === 'fastify is awesome !') {
          return next(true)
        }

        next(false)
      }
    }
  })

  app.listen(0, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws', {
      headers: { 'x-custom-header': 'fastify is awesome !' }
    })
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.tearDown(client.destroy.bind(client))

    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', chunk => {
      t.equal(chunk, JSON.stringify({
        type: 'connection_ack'
      }))
      client.end()
    })

    const ws2 = new WebSocket(url, 'graphql-ws', {
      headers: { 'x-custom-header': 'other-value' }
    })
    const client2 = WebSocket.createWebSocketStream(ws2, { encoding: 'utf8', objectMode: true })
    t.tearDown(client2.destroy.bind(client2))

    client2.setEncoding('utf8')
    client2.write(JSON.stringify({
      type: 'connection_init'
    }))
    client2.on('error', (err) => {
      t.equal('Unexpected server response: 401', err.message)
      client2.end()
    })
  })
})

test('connection is not allowed when onConnect callback called with `false`', t => {
  t.plan(2)
  const app = Fastify()
  t.tearDown(() => app.close())

  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: (parent, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      onConnect (data) {
        if (data.payload && data.payload.authorization === 'allow') {
          return true
        }
        return false
      }
    }
  })

  app.listen(0, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.tearDown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init',
      payload: {
        authorization: 'allow'
      }
    }))
    client.on('data', chunk => {
      t.equal(chunk, JSON.stringify({
        type: 'connection_ack'
      }))
      client.end()
    })

    const ws2 = new WebSocket(url, 'graphql-ws')
    const client2 = WebSocket.createWebSocketStream(ws2, { encoding: 'utf8', objectMode: true })
    t.tearDown(client2.destroy.bind(client2))

    client2.setEncoding('utf8')
    client2.write(JSON.stringify({
      type: 'connection_init'
    }))
    client2.on('data', chunk => {
      t.equal(chunk, JSON.stringify({
        type: 'connection_error',
        payload: {
          message: 'Forbidden'
        }
      }))
      client2.end()
    })
  })
})

test('connection is not allowed when onConnect callback throws', t => {
  t.plan(1)
  const app = Fastify()
  t.tearDown(() => app.close())

  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: (parent, { x, y }) => x + y
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: {
      onConnect (data) {
        throw new Error('kaboom')
      }
    }
  })

  app.listen(0, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.tearDown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', chunk => {
      t.equal(chunk, JSON.stringify({
        type: 'connection_error',
        payload: {
          message: 'Forbidden'
        }
      }))
      client.end()
    })
  })
})

test('cached errors', async (t) => {
  const app = Fastify()

  const schema = `
    type Query {
      name: String
    }
  `

  app.register(GQL, {
    schema
  })

  const get = await app.inject({
    method: 'GET',
    url: '/graphql?query=query { test }'
  })

  t.deepEqual(JSON.parse(get.body), {
    errors: [
      {
        message: 'Cannot query field "test" on type "Query".',
        locations: [
          {
            line: 1,
            column: 9
          }
        ]
      }
    ],
    data: null
  })

  const post = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: 'query { test }'
    }
  })

  t.deepEqual(JSON.parse(post.body), {
    errors: [
      {
        message: 'Cannot query field "test" on type "Query".',
        locations: [
          {
            line: 1,
            column: 9
          }
        ]
      }
    ],
    data: null
  })
})

test('disable GET graphiql if ide is not "graphiql" or "playground"', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'not-graphiql'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.strictEqual(res.statusCode, 404)

  const res2 = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res2.statusCode, 404)
})

test('render graphiql if graphiql: true', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    graphiql: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.strictEqual(res.statusCode, 200)

  const res2 = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res2.statusCode, 404)
})

test('if ide is grpahiql, always serve main.js and sw.js', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'graphiql'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql/main.js'
  })
  t.strictEqual(res.statusCode, 200)

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphiql/sw.js'
  })
  t.strictEqual(res2.statusCode, 200)
})

test('if ide is playground, do not serve main.js and sw.js', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'playground'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql/main.js'
  })
  t.strictEqual(res.statusCode, 404)

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphiql/sw.js'
  })
  t.strictEqual(res2.statusCode, 404)
})

test('if ide is playground, serve init.js with the correct endpoint', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'playground',
    path: '/app/graphql'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/playground/init.js'
  })
  t.strictEqual(res.statusCode, 200)
  t.strictEqual(res.headers['content-type'], 'application/javascript')
  t.matchSnapshot(res.body)
})

test('if ide is graphiql, serve config.js with the correct endpoint', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    ide: 'graphiql',
    path: '/app/graphql'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql/config.js'
  })
  t.strictEqual(res.statusCode, 200)
  t.strictEqual(res.headers['content-type'], 'application/javascript')
  t.matchSnapshot(res.body)
})

test('GET route with query, variables & persisted', async (t) => {
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
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    }
  })

  const res1 = await app.inject({
    method: 'GET',
    url: '/graphql?query=248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602&persisted=true'
  })

  t.deepEqual(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphql?query=495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf&variables={"x":2,"y":2}&persisted=true'
  })

  t.deepEqual(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'GET',
    url: '/graphql?query=03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e&persisted=true'
  })

  t.deepEqual(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('POST route with query, variables & persisted', async (t) => {
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
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    }
  })

  const res1 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602',
      persisted: true
    }
  })

  t.deepEqual(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf',
      variables: { x: 2, y: 2 },
      persisted: true
    }
  })

  t.deepEqual(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e',
      persisted: true
    }
  })

  t.deepEqual(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('if onlyPersisted then nullify graphiql option', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    graphiql: true,
    onlyPersisted: true,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    }
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql/main.js'
  })
  t.strictEqual(res.statusCode, 404)

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphiql/sw.js'
  })
  t.strictEqual(res2.statusCode, 404)
})

test('if onlyPersisted then reject unknown queries with 400 for GET route', async (t) => {
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
    graphiql: true,
    onlyPersisted: true,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    }
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}' // custom/unknown query
  })

  t.is(res.statusCode, 400)
})

test('if onlyPersisted then reject unknown queries with 400 for POST route', async (t) => {
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
    onlyPersisted: true,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '{ add(x: 2, y: 2) }' // custom/unknown query
    }
  })

  t.equal(res.statusCode, 400)
})
