'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const split = require('split2')
const querystring = require('querystring')
const WebSocket = require('ws')
const { GraphQLError } = require('graphql')
const semver = require('semver')
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
  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('POST route, no query error', async (t) => {
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
    method: 'POST',
    url: '/graphql',
    body: {}
  })

  t.equal(res.statusCode, 400)
  t.same(JSON.parse(res.body), {
    errors: [{ message: 'Unknown query' }],
    data: null
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
  t.same(JSON.parse(res.body), {
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
  t.same(JSON.parse(res.body), {
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

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('GET route, no query error', async (t) => {
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
    url: '/graphql'
  })

  t.equal(res.statusCode, 400)
  t.same(JSON.parse(res.body), {
    errors: [{ message: 'Unknown query' }],
    data: null
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

  t.same(JSON.parse(res.body), {
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

  t.equal(res.statusCode, 400)
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

  t.equal(res.statusCode, 400)
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

  t.equal(res.statusCode, 400)
})

test('GET route with extensions', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  const persistedQueryProvider = GQL.persistedQueryDefaults.automatic()

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider
  })

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'
  const sha256Hash = persistedQueryProvider.getHashForQuery(query)
  persistedQueryProvider.saveQuery(sha256Hash, query)

  const res = await app.inject({
    method: 'GET',
    url: `/graphql?extensions=${JSON.stringify({
      persistedQuery: {
        version: 1,
        sha256Hash
      }
    })}&variables=${JSON.stringify({ x: 2, y: 2 })}`
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('GET route with bad JSON extensions', async (t) => {
  t.plan(2)
  const lines = split(JSON.parse)
  const app = Fastify({
    logger: {
      stream: lines
    }
  })
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  const persistedQueryProvider = GQL.persistedQueryDefaults.automatic()

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?extensions=notajson'
  })

  t.equal(res.statusCode, 400)
  if (semver.gte(process.version, '20.0.0')) {
    t.same(res.json(),
      { data: null, errors: [{ message: 'Unexpected token \'o\', "notajson" is not valid JSON' }] }
    )
  } else {
    t.same(res.json(),
      { data: null, errors: [{ message: 'Unexpected token o in JSON at position 1' }] }
    )
  }
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

  t.same(JSON.parse(res.body), {
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

  t.same(JSON.parse(res.body), {
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

  t.same(JSON.parse(res.body), {
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

  t.same(res.statusCode, 404)
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

test('POST return 400 error handler provide custom context to custom async error formatter', async (t) => {
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
    errorHandler: true,
    context: async () => {
      return { topic: 'POINT_ADDED' }
    },
    errorFormatter: (_execution, context) => {
      t.has(context, { topic: 'POINT_ADDED' })
      return {
        statusCode: 400,
        response: {
          data: { add: null },
          errors: [{ message: 'Internal Server Error' }]
        }
      }
    }
  })

  // Invalid query
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: { query: '{ add(x: 2, y: 2)' }
  })

  t.equal(res.statusCode, 400)
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

  t.same(JSON.parse(res.body), {
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

  t.same(JSON.parse(res.body), {
    data: {
      setMessage: 'hello world'
    }
  })
  t.equal(msg, 'hello world')
})

test('HTTP mutation with GET errors', async (t) => {
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

test('websocket mutation with GET allowed', async (t) => {
  const app = Fastify()

  // Simulate fastify-websocket logic
  app.addHook('onRequest', (request, reply, done) => {
    request.ws = true
    done()
  })

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
    async getMessage () {
      return msg
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const query = querystring.stringify({
    query: 'mutation { setMessage(message: "hello world") }'
  })

  const res = await app.inject({
    headers: {
      connection: 'upgrade',
      upgrade: 'websocket'
    },
    method: 'GET',
    url: '/graphql?' + query
  })

  t.same(JSON.parse(res.body), {
    data: {
      setMessage: 'hello world'
    }
  })
  t.equal(msg, 'hello world')
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
  t.same(JSON.parse(res.body), {
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
    t.same(JSON.parse(res.body), {
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
    t.same(JSON.parse(res.body), {
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
    t.equal(err.message, 'jit is not possible if there are root functions')
  }
})

test('GET graphiql endpoint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: 'graphiql',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 200)
})

test('GET graphiql endpoint with boolean', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: true,
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 200)
})

test('Disable ide endpoint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: false,
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 404)
})

test('Disable ide endpoint by leaving empty', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, { schema })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 404)
})

test('GET graphiql endpoint with prefix', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: 'graphiql',
    prefix: '/test-prefix',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/test-prefix/graphiql'
  })

  t.equal(res.statusCode, 200)
})

test('GET graphiql endpoint with prefixed wrapper', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(async function (app, opts) {
    app.register(GQL, {
      schema,
      resolvers,
      ide: 'graphiql'
    })
  }, { prefix: '/test-wrapper-prefix' })

  const res = await app.inject({
    method: 'GET',
    url: '/test-wrapper-prefix/graphiql'
  })

  t.equal(res.statusCode, 200)
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

  t.equal(res.statusCode, 200)
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

  t.equal(res.statusCode, 200)
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

  t.equal(res.statusCode, 403)
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

test('server should return 200 on graphql errors (if field can not be null)', async (t) => {
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

  t.equal(response.statusCode, 200)
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
      message: 'Int cannot represent non-integer value: "2"',
      locations: [{
        line: 1,
        column: 8
      }]
    }],
    data: null
  }

  t.equal(res.statusCode, 400)
  t.strictSame(JSON.parse(res.body), expectedResult)
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

  t.equal(res.statusCode, 403)
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

  const expectedResult = { errors: [{ message: 'body must be object' }], data: null }

  t.equal(res.statusCode, 400)
  t.strictSame(JSON.parse(res.body), expectedResult)
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

  t.same(JSON.parse(get.body), {
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

  t.same(JSON.parse(post.body), {
    data: {
      test: 'custom'
    }
  })
})

test('routes with custom class-based context', async (t) => {
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
    }
  })

  const get = await app.inject({
    method: 'GET',
    url: '/graphql?query=query { test }'
  })

  t.same(JSON.parse(get.body), {
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

  t.same(JSON.parse(post.body), {
    data: {
      test: 'custom'
    }
  })
})

test('connection is not allowed when verifyClient callback called with `false`', t => {
  t.plan(2)
  const app = Fastify()
  t.teardown(() => app.close())

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

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws', {
      headers: { 'x-custom-header': 'fastify is awesome !' }
    })
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

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
    t.teardown(client2.destroy.bind(client2))

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
  t.teardown(() => app.close())

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

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

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
    t.teardown(client2.destroy.bind(client2))

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
  t.teardown(() => app.close())

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

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

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

test('onDisconnect is called with connection context when connection gets disconnected', t => {
  t.plan(1)
  const app = Fastify()
  t.teardown(() => app.close())

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
        return {
          test: 'custom'
        }
      },
      onDisconnect (context) {
        t.equal(context.test, 'custom')
      }
    }
  })

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', data => {
      client.destroy()
    })
  })
})

test('promise returned from onDisconnect resolves', t => {
  t.plan(1)

  const app = Fastify()
  t.teardown(() => app.close())

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
        return {
          test: 'custom'
        }
      },
      async onDisconnect (context) {
        t.equal(context.test, 'custom')
      }
    }
  })

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', data => {
      client.destroy()
    })
  })
})

test('error thrown from onDisconnect is logged', t => {
  t.plan(1)

  const error = new Error('error')

  const app = Fastify()

  // override `app.log` to avoid polluting other tests
  app.log = Object.create(app.log)
  app.log.error = (e) => { t.same(error, e) }

  t.teardown(() => app.close())

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
      onDisconnect () {
        throw error
      }
    }
  })

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', data => {
      client.destroy()
    })
  })
})

test('promise rejection from onDisconnect is logged', t => {
  t.plan(1)

  const error = new Error('error')

  const app = Fastify()

  // override `app.log` to avoid polluting other tests
  app.log = Object.create(app.log)
  app.log.error = (e) => { t.same(error, e) }
  t.teardown(() => app.close())

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
      async onDisconnect () {
        throw error
      }
    }
  })

  app.listen({ port: 0 }, () => {
    const url = 'ws://localhost:' + (app.server.address()).port + '/graphql'
    const ws = new WebSocket(url, 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', data => {
      client.destroy()
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

  t.same(JSON.parse(get.body), {
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

  t.same(JSON.parse(post.body), {
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

test('disable GET graphiql if ide is not "graphiql"', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: 'not-graphiql',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 404)
})

test('render graphiql if graphiql: true', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    graphiql: true,
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 200)
})

test('if ide is graphiql, always serve main.js and sw.js', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: 'graphiql',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql/main.js'
  })
  t.equal(res.statusCode, 200)

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphiql/sw.js'
  })
  t.equal(res2.statusCode, 200)
})

test('if ide is graphiql, serve config.js with the correct endpoint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: 'graphiql',
    path: '/app/graphql',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql/config.js'
  })
  t.equal(res.statusCode, 200)
  t.equal(res.headers['content-type'], 'application/javascript')
  t.matchSnapshot(res.body)
})

test('if ide is graphiql with a prefix, serve config.js with the correct endpoint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: 'graphiql',
    path: '/app/graphql',
    prefix: '/something',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/something/graphiql/config.js'
  })
  t.equal(res.statusCode, 200)
  t.equal(res.headers['content-type'], 'application/javascript')
  t.equal(res.body.toString(), 'window.GRAPHQL_ENDPOINT = \'/something/app/graphql\';\nwindow.GRAPHIQL_PLUGIN_LIST = []')
})

test('if ide is graphiql with a prefix from a wrapping plugin, serve config.js with the correct endpoint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  app.register(async (app) => {
    app.register(GQL, {
      ide: 'graphiql',
      path: '/app/graphql',
      schema
    })
  }, { prefix: '/something' })

  const res = await app.inject({
    method: 'GET',
    url: '/something/graphiql/config.js'
  })
  t.equal(res.statusCode, 200)
  t.equal(res.headers['content-type'], 'application/javascript')
  t.equal(res.body.toString(), 'window.GRAPHQL_ENDPOINT = \'/something/app/graphql\';\nwindow.GRAPHIQL_PLUGIN_LIST = []')
})

test('if operationName is null, it should work fine', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  const operationName = null

  const query = 'query { add(x: 2, y: 3) }'

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({
      query,
      operationName,
      variables: {}
    })
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), {
    data: {
      add: 5
    }
  })
})

test('GET graphiql endpoint with object and enabled', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: {},
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 200)
})

test('disable GET graphiql endpoint with object if note enabled', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: { enabled: false },
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.equal(res.statusCode, 404)
})

test('if ide has plugin set, serve config.js with the correct endpoint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: {
      enabled: true,
      plugins: [
        {
          name: 'samplePlugin',
          props: { foo: 'bar' },
          umdUrl: '/graphiql/explain.js',
          fetcherWrapper: 'parsePlugin'
        }
      ]
    },
    path: '/app/graphql',
    prefix: '/something',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/something/graphiql/config.js'
  })
  t.equal(res.statusCode, 200)
  t.equal(res.headers['content-type'], 'application/javascript')
  t.equal(res.body.toString(), 'window.GRAPHQL_ENDPOINT = \'/something/app/graphql\';\n' +
    'window.GRAPIHQL_PLUGIN_SAMPLEPLUGIN = ' +
    '{"name":"samplePlugin","props":{"foo":"bar"},"umdUrl":"/graphiql/explain.js","fetcherWrapper":"parsePlugin"};\n' +
    'window.GRAPHIQL_PLUGIN_LIST = ["samplePlugin"]')
})

test('if ide has plugin set, serve config.js with the correct endpoint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    ide: {
      enabled: true,
      plugins: [
        {
          props: { foo: 'bar' },
          umdUrl: '/graphiql/explain.js',
          fetcherWrapper: 'parsePlugin'
        }
      ]
    },
    path: '/app/graphql',
    prefix: '/something',
    schema
  })

  const res = await app.inject({
    method: 'GET',
    url: '/something/graphiql/config.js'
  })
  t.equal(res.statusCode, 200)
  t.equal(res.headers['content-type'], 'application/javascript')
  t.equal(res.body.toString(), 'window.GRAPHQL_ENDPOINT = \'/something/app/graphql\';\n' +
    'window.GRAPHIQL_PLUGIN_LIST = []')
})

test('GET graphql endpoint with invalid additionalRouteProp constraint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    schema,
    additionalRouteOptions: {
      constraints: {
        host: 'auth.fastify.dev'
      }
    }
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql',
    headers: {
      Host: 'fail.fastify.dev'
    }
  })

  t.equal(res.statusCode, 404)
})

test('GET graphql endpoint with valid additionalRouteProp constraint', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  app.register(GQL, {
    schema,
    additionalRouteOptions: {
      constraints: {
        host: 'auth.fastify.dev'
      }
    }
  })

  const query = '{ add(x: 2, y: 2) }'

  const res = await app.inject({
    method: 'GET',
    url: '/graphql',
    headers: {
      Host: 'auth.fastify.dev',
      'Content-Type': 'text/plain'
    },
    query: {
      query
    }
  })

  t.equal(res.statusCode, 200)
})

test('GET graphql endpoint, additionalRouteOptions should ignore custom handler', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  let executed = false

  app.register(GQL, {
    schema,
    additionalRouteOptions: {
      // @ts-expect-error `handler` property is ignored in props
      handler (req, reply) {
        executed = true
      }
    }
  })

  const query = '{ add(x: 2, y: 2) }'

  const res = await app.inject({
    method: 'GET',
    url: '/graphql',
    headers: {
      'Content-Type': 'text/plain'
    },
    query: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.notOk(executed)
})
