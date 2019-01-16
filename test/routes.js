'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const querystring = require('querystring')
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
    graphiql: true,
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
    add: async ({ x, y }) => {
      throw new Error('dummy error')
    }
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
    url: '/graphql?query={add(x:,y:2)}'
  })

  t.strictEqual(res.statusCode, 403)
})
