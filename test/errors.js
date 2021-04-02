'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')
const { ErrorWithProps } = GQL
const { FederatedError } = require('../lib/errors')
const split = require('split2')

test('errors - multiple extended errors', async (t) => {
  const schema = `
    type Query {
      error: String
      successful: String
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new ErrorWithProps('Error', { code: 'ERROR', additional: 'information', other: 'data' })
      },
      successful () {
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.payload), {
    data: {
      error: null,
      successful: 'Runs OK'
    },
    errors: [
      {
        message: 'Error',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['error'],
        extensions: {
          code: 'ERROR',
          additional: 'information',
          other: 'data'
        }
      }
    ]
  })
})

test('errors - extended errors with number extensions', async (t) => {
  const schema = `
    type Query {
      willThrow: String
    }
  `

  const resolvers = {
    Query: {
      willThrow () {
        throw new ErrorWithProps('Extended Error', { code: 'EXTENDED_ERROR', floating: 3.14, timestamp: 1324356, reason: 'some reason' })
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={willThrow}'
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.payload), {
    data: {
      willThrow: null
    },
    errors: [
      {
        message: 'Extended Error',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['willThrow'],
        extensions: {
          code: 'EXTENDED_ERROR',
          floating: 3.14,
          timestamp: 1324356,
          reason: 'some reason'
        }
      }
    ]
  })
})

test('errors - extended errors optional parameters', async (t) => {
  const schema = `
    type Query {
      one: String
      two: String
      three: String
      four: String
    }
  `

  const resolvers = {
    Query: {
      one () {
        throw new ErrorWithProps('Extended Error')
      },
      two () {
        throw new ErrorWithProps('Extended Error', { code: 'ERROR_TWO', reason: 'some reason' })
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={one,two}'
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.payload), {
    data: {
      one: null,
      two: null
    },
    errors: [
      {
        message: 'Extended Error',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['one']
      },
      {
        message: 'Extended Error',
        locations: [
          {
            line: 1,
            column: 6
          }
        ],
        path: ['two'],
        extensions: {
          code: 'ERROR_TWO',
          reason: 'some reason'
        }
      }
    ]
  })
})

test('errors - errors with jit enabled', async (t) => {
  const schema = `
    type Query {
      error: String
      successful: String
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new ErrorWithProps('Error', { code: 'ERROR', additional: 'information', other: 'data' })
      },
      successful () {
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    jit: 1
  })

  await app.ready()

  await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.payload), {
    data: {
      error: null,
      successful: 'Runs OK'
    },
    errors: [
      {
        message: 'Error',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['error'],
        extensions: {
          code: 'ERROR',
          additional: 'information',
          other: 'data'
        }
      }
    ]
  })
})

test('errors - errors with jit enabled using the app decorator', async (t) => {
  const schema = `
    type Query {
      error: String
      successful: String
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new ErrorWithProps('Error', { code: 'ERROR', additional: 'information', other: 'data' })
      },
      successful () {
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    jit: 1
  })

  await app.ready()

  // jit it
  await app.graphql('{error,successful}')

  const payload = await app.graphql('{error,successful}')

  t.same(payload, {
    data: {
      error: null,
      successful: 'Runs OK'
    },
    errors: [
      {
        message: 'Error',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['error'],
        extensions: {
          code: 'ERROR',
          additional: 'information',
          other: 'data'
        }
      }
    ]
  })
})

test('errors - federated errors with jit enabled', async (t) => {
  const schema = `
    type Query {
      error: String
      successful: String
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new FederatedError([{
          message: 'Invalid operation',
          locations: [{ column: 3, line: 2 }],
          path: ['error'],
          extensions: {
            code: 'ERROR',
            additional: 'information',
            other: 'data'
          }
        }])
      },
      successful () {
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    jit: 1
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  const jitres = await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  const expectedResult = {
    data: {
      error: null,
      successful: 'Runs OK'
    },
    errors: [
      {
        message: 'Invalid operation',
        locations: [{ column: 3, line: 2 }],
        path: ['error'],
        extensions: {
          code: 'ERROR',
          additional: 'information',
          other: 'data'
        }
      }
    ]
  }

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.payload), expectedResult)

  t.equal(jitres.statusCode, 200)
  t.same(JSON.parse(jitres.payload), expectedResult)
})

test('errors - federated errors without locations, path and extensions', async (t) => {
  const schema = `
    type Query {
      error: String
      successful: String
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new FederatedError([{ message: 'Invalid operation' }])
      },
      successful () {
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    jit: 1
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  const jitres = await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  const expectedResult = {
    data: {
      error: null,
      successful: 'Runs OK'
    },
    errors: [{ message: 'Invalid operation' }]
  }

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.payload), expectedResult)

  t.equal(jitres.statusCode, 200)
  t.same(JSON.parse(jitres.payload), expectedResult)
})

test('errors - custom error formatter that uses default error formatter', async (t) => {
  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => { throw new Error('Bad Resolver') }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    errorFormatter: (err, ctx) => {
      t.ok(ctx)
      t.equal(ctx.app, app)
      t.ok(ctx.reply)
      const response = GQL.defaultErrorFormatter(err, ctx)
      response.statusCode = 499
      return response
    }
  })

  await app.ready()

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: { query: ' query { bad }' }
  })

  const body = JSON.parse(res.body)
  t.equal(res.statusCode, 499)
  t.equal(body.errors[0].message, 'Bad Resolver')
})

test('POST query with a resolver which which throws and a custom error formatter', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => { throw new Error('Bad Resolver') }
  }

  app.register(GQL, {
    schema,
    resolvers,
    allowBatchedQueries: true,
    errorFormatter: (errors, ctx) => {
      t.ok(ctx)
      t.equal(ctx.app, app)
      t.ok(ctx.reply)
      return {
        statusCode: 200,
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
    body: {
      operationName: 'BadQuery',
      variables: { x: 1 },
      query: `
          query BadQuery {
              bad
          }`
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), { data: null, errors: [{ message: 'Internal Server Error' }] })
})

test('POST query which throws, with custom error formatter and JIT enabled, twice', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => { throw new Error('Bad Resolver') }
  }

  app.register(GQL, {
    schema,
    resolvers,
    allowBatchedQueries: true,
    jit: 1,
    errorFormatter: () => ({
      statusCode: 200,
      response: {
        data: null,
        errors: [{ message: 'Internal Server Error' }]
      }
    })
  })

  let res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'BadQuery',
      variables: { x: 1 },
      query: `
          query BadQuery {
              bad
          }`
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), { data: null, errors: [{ message: 'Internal Server Error' }] })

  res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'BadQuery',
      variables: { x: 1 },
      query: `
          query BadQuery {
              bad
          }`
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), { data: null, errors: [{ message: 'Internal Server Error' }] })
})

test('POST query which throws, with JIT enabled, twice', async (t) => {
  const lines = split(JSON.parse)
  const app = Fastify({
    logger: {
      stream: lines
    }
  })

  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => { throw new Error('Bad Resolver') }
  }

  app.register(GQL, {
    schema,
    resolvers,
    jit: 1
  })

  let res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'BadQuery',
      variables: { x: 1 },
      query: `
          query BadQuery {
              bad
          }`
    }
  })

  t.equal(res.statusCode, 200)
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))

  res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'BadQuery',
      variables: { x: 1 },
      query: `
          query BadQuery {
              bad
          }`
    }
  })

  t.equal(res.statusCode, 200)
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))

  lines.end()

  const errors = [{
    msg: 'Bad Resolver',
    errorType: 'GraphQLError'
  }, {
    msg: 'Int cannot represent non-integer value: [function bad]',
    errorType: 'GraphQLError'
  }]

  for await (const line of lines) {
    if (line.err) {
      const expected = errors.shift()
      t.equal(line.msg, expected.msg)
      t.equal(line.err.type, expected.errorType)
    }
  }

  t.equal(errors.length, 0)
})

test('app.graphql which throws, with JIT enabled, twice', async (t) => {
  const lines = split(JSON.parse)
  const app = Fastify({
    logger: {
      stream: lines
    }
  })

  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => { throw new Error('Bad Resolver') }
  }

  app.register(GQL, {
    schema,
    resolvers,
    jit: 1
  })

  await app.ready()

  const query = `
    query BadQuery {
        bad
    }`

  let res = await app.graphql(query, null, { x: 1 })

  t.matchSnapshot(JSON.stringify(res), null, 2)

  res = await app.graphql(query, null, { x: 1 })

  t.matchSnapshot(JSON.stringify(res), null, 2)

  lines.end()

  const errors = [{
    msg: 'Bad Resolver',
    errorType: 'GraphQLError'
  }, {
    msg: 'Int cannot represent non-integer value: [function bad]',
    errorType: 'GraphQLError'
  }]

  for await (const line of lines) {
    if (line.err) {
      const expected = errors.shift()
      t.equal(line.msg, expected.msg)
      t.equal(line.err.type, expected.errorType)
    }
  }

  t.equal(errors.length, 0)
})
