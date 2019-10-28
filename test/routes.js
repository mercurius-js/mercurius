'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const querystring = require('querystring')
const websocket = require('websocket-stream')
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

test('GET return 500 on resolver error', async (t) => {
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

  t.equal(res.statusCode, 500) // Internal Server Error
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))
})

test('POST return 500 on resolver error', async (t) => {
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

  t.equal(res.statusCode, 500) // Internal Server Error
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
    graphiql: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphiql'
  })
  t.strictEqual(res.statusCode, 302)
  t.strictEqual(res.headers.location, '/graphiql.html')
})

test('GET graphiql endpoint with prefix', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    graphiql: 'graphiql',
    prefix: '/test-prefix'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/test-prefix/graphiql'
  })

  t.strictEqual(res.statusCode, 302)
  t.strictEqual(res.headers.location, '/test-prefix/graphiql.html')
})

test('GET graphiql endpoint with prefixed wrapper', async (t) => {
  const app = Fastify()
  app.register(async function (app, opts) {
    app.register(GQL, {
      graphiql: true
    })
  }, { prefix: '/test-wrapper-prefix' })

  const res = await app.inject({
    method: 'GET',
    url: '/test-wrapper-prefix/graphiql'
  })

  t.strictEqual(res.statusCode, 302)
  t.strictEqual(res.headers.location, '/test-wrapper-prefix/graphiql.html')
})

test('GET graphql playground endpoint', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    graphiql: 'playground'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/playground'
  })
  t.strictEqual(res.statusCode, 302)
  t.strictEqual(res.headers.location, '/playground.html')
})

test('GET graphql playground endpoint with prefix', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    graphiql: 'playground',
    prefix: '/test-prefix'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/test-prefix/playground'
  })

  t.strictEqual(res.statusCode, 302)
  t.strictEqual(res.headers.location, '/test-prefix/playground.html')
})

test('GET graphql playground endpoint with prefixed wrapper', async (t) => {
  const app = Fastify()
  app.register(async function (app, opts) {
    app.register(GQL, {
      graphiql: 'playground'
    })
  }, { prefix: '/test-wrapper-prefix' })

  const res = await app.inject({
    method: 'GET',
    url: '/test-wrapper-prefix/playground'
  })

  t.strictEqual(res.statusCode, 302)
  t.strictEqual(res.headers.location, '/test-wrapper-prefix/playground.html')
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
    }]
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

  const expectedResult = { errors: [{ message: 'body should be object' }] }

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
    const client = websocket(url, 'graphql-ws', {
      objectMode: true,
      headers: { 'x-custom-header': 'fastify is awesome !' }
    })
    t.tearDown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write(JSON.stringify({
      type: 'connection_init'
    }))
    client.on('data', chunk => {
      t.equal(chunk, JSON.stringify({
        type: 'connection_ack'
      }))
      client.end()
    })

    const client2 = websocket(url, 'graphql-ws', {
      objectMode: true,
      headers: { 'x-custom-header': 'other-value' }
    })
    t.tearDown(client2.destroy.bind(client2))

    client2.setEncoding('utf8')
    client2.write(JSON.stringify({
      type: 'connection_init'
    }))
    client2.on('error', (err) => {
      t.equal('unexpected server response (401)', err.message)
      client2.end()
    })
  })
})
