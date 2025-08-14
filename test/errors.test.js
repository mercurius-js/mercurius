'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const mq = require('mqemitter')
const WebSocket = require('ws')
const GQL = require('..')
const { ErrorWithProps } = GQL
const { kRequestContext } = require('../lib/symbols')
const split = require('split2')
const { GraphQLError } = require('graphql-jit/dist/error')
const semver = require('semver')
const Snap = require('@matteo.collina/snap')
const snap = Snap(__filename)

test('ErrorWithProps - support status code in the constructor', async (t) => {
  const error = new ErrorWithProps('error', {}, 500)
  t.assert.strictEqual(error.statusCode, 500)
})

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
        throw new ErrorWithProps('Error', {
          code: 'ERROR',
          additional: 'information',
          other: 'data'
        })
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

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
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
        throw new ErrorWithProps('Extended Error', {
          code: 'EXTENDED_ERROR',
          floating: 3.14,
          timestamp: 1324356,
          reason: 'some reason'
        })
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

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
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
        throw new ErrorWithProps('Extended Error', {
          code: 'ERROR_TWO',
          reason: 'some reason'
        })
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

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
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
        throw new ErrorWithProps('Error', {
          code: 'ERROR',
          additional: 'information',
          other: 'data'
        })
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

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
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
        throw new ErrorWithProps('Error', {
          code: 'ERROR',
          additional: 'information',
          other: 'data'
        })
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

  t.assert.deepStrictEqual(payload, {
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

test('errors - custom error formatter that uses default error formatter', async (t) => {
  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => {
      throw new Error('Bad Resolver')
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    errorFormatter: (err, ctx) => {
      t.assert.ok(ctx)
      t.assert.strictEqual(ctx.app, app)
      t.assert.ok(ctx.reply)
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
  t.assert.strictEqual(res.statusCode, 499)
  t.assert.strictEqual(body.errors[0].message, 'Bad Resolver')
})

test('subscription server sends correct error if there\'s a graphql error', (t) => {
  const app = Fastify()
  t.after(() => app.close())

  const sendTestQuery = () => {
    app.inject(
      {
        method: 'POST',
        url: '/graphql',
        body: {
          query: `
          query {
            notifications {
              id
              message
            }
          }
        `
        }
      },
      () => {
        sendTestMutation()
      }
    )
  }

  const sendTestMutation = () => {
    app.inject(
      {
        method: 'POST',
        url: '/graphql',
        body: {
          query: `
          mutation {
            addNotification(message: 'Hello World') {
              id
            }
          }
        `
        }
      },
      () => {}
    )
  }

  const emitter = mq()
  const schema = `
    type Notification {
      id: ID!
      message: Int
    }

    type Query {
      notifications: [Notification]
    }

    type Mutation {
      addNotification(message: String): Notification
    }

    type Subscription {
      notificationAdded: Notification
    }
  `

  let idCount = 1
  const notifications = [
    {
      id: idCount,
      message: 'Notification message'
    }
  ]

  const resolvers = {
    Query: {
      notifications: () => notifications
    },
    Mutation: {
      addNotification: async (_, { message }) => {
        const id = idCount++
        const notification = {
          id,
          message
        }
        notifications.push(notification)
        await emitter.emit({
          topic: 'NOTIFICATION_ADDED',
          payload: {
            notificationAdded: notification
          }
        })

        return notification
      }
    },
    Subscription: {
      notificationAdded: {
        subscribe: (root, args, ctx) => {
          return ctx.pubsub.subscribe('NOTIFICATION_ADDED')
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    errorFormatter: (execution, ctx) => {
      const formatted = GQL.defaultErrorFormatter(execution, ctx)
      const errors = execution.errors.map(() => {
        return new GraphQLError('Whoops! Something went wrong.')
      })

      return {
        statusCode: formatted.statusCode,
        response: {
          data: formatted.response.data,
          errors
        }
      }
    },
    subscription: {
      emitter
    }
  })

  app.listen({ port: 0 }, (err) => {
    t.error(err)

    const ws = new WebSocket(
      'ws://localhost:' + app.server.address().port + '/graphql',
      'graphql-ws'
    )
    const client = WebSocket.createWebSocketStream(ws, {
      encoding: 'utf8',
      objectMode: true
    })
    t.after(() => client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(
      JSON.stringify({
        type: 'connection_init'
      })
    )

    client.write(
      JSON.stringify({
        id: 1,
        type: 'start',
        payload: {
          query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
        }
      })
    )

    client.write(
      JSON.stringify({
        id: 2,
        type: 'start',
        payload: {
          query: `
          subscription {
            notificationAdded {
              id
              message
            }
          }
        `
        }
      })
    )

    client.write(
      JSON.stringify({
        id: 2,
        type: 'stop'
      })
    )

    client.on('data', (chunk) => {
      const data = JSON.parse(chunk)

      if (data.id === 1 && data.type === 'data') {
        t.assert.strictEqual(
          chunk,
          JSON.stringify({
            type: 'data',
            id: 1,
            payload: {
              data: {
                notificationAdded: {
                  id: '1',
                  message: null
                }
              },
              errors: [
                {
                  message: 'Whoops! Something went wrong.'
                }
              ]
            }
          })
        )

        client.end()
        t.end()
      } else if (data.id === 2 && data.type === 'complete') {
        sendTestQuery()
      }
    })
  })
})

test('POST query with a resolver which which throws and a custom error formatter', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => {
      throw new Error('Bad Resolver')
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    allowBatchedQueries: true,
    errorFormatter: (errors, ctx) => {
      t.assert.ok(ctx)
      t.assert.strictEqual(ctx.app, app)
      t.assert.ok(ctx.reply)
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

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [{ message: 'Internal Server Error' }]
  })
})

test('POST query which throws, with custom error formatter and JIT enabled, twice', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        bad: Int
      }
    `

  const resolvers = {
    bad: () => {
      throw new Error('Bad Resolver')
    }
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

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [{ message: 'Internal Server Error' }]
  })

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

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [{ message: 'Internal Server Error' }]
  })
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
    bad: () => {
      throw new Error('Bad Resolver')
    }
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

  t.assert.strictEqual(res.statusCode, 200)
  await snap(JSON.stringify(JSON.parse(res.body), null, 2))

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

  t.assert.strictEqual(res.statusCode, 200)
  await snap(JSON.stringify(JSON.parse(res.body), null, 2))

  lines.end()

  const errors = [
    {
      msg: 'Bad Resolver',
      errorType: 'GraphQLError'
    },
    {
      msg: 'Int cannot represent non-integer value: [function bad]',
      errorType: 'GraphQLError'
    }
  ]

  for await (const line of lines) {
    if (line.err) {
      const expected = errors.shift()
      t.assert.strictEqual(line.msg, expected.msg)
      t.assert.strictEqual(line.err.type, expected.errorType)
    }
  }

  t.assert.strictEqual(errors.length, 0)
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
    bad: () => {
      throw new Error('Bad Resolver')
    }
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

  await snap(JSON.stringify(res, null, 2))

  res = await app.graphql(query, null, { x: 1 })

  await snap(JSON.stringify(res, null, 2))

  lines.end()

  const errors = [
    {
      msg: 'Bad Resolver',
      errorType: 'GraphQLError'
    },
    {
      msg: 'Int cannot represent non-integer value: [function bad]',
      errorType: 'GraphQLError'
    }
  ]

  for await (const line of lines) {
    if (line.err) {
      const expected = errors.shift()
      t.assert.strictEqual(line.msg, expected.msg)
      t.assert.strictEqual(line.err.type, expected.errorType)
    }
  }

  t.assert.strictEqual(errors.length, 0)
})

test('errors - should default to HTTP Status Code `200 OK` if the data is present', async (t) => {
  t.plan(2)

  const schema = `
    type Query {
      error: String
      successful: String
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new ErrorWithProps('Error', undefined, 500)
      },
      successful () {
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()
  t.after(() => app.close())

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={error,successful}'
  })

  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: {
      error: null,
      successful: 'Runs OK'
    },
    errors: [
      {
        message: 'Error',
        locations: [{ column: 2, line: 1 }],
        path: ['error']
      }
    ]
  })
  t.assert.strictEqual(res.statusCode, 200)
})

test('bad json', async (t) => {
  const schema = `
    type Query {
      successful: String
    }
  `

  const resolvers = {
    Query: {
      successful () {
        t.assert.fail('Should not be called')
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
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: 'this is not a json',
    url: '/graphql'
  })

  t.assert.strictEqual(res.statusCode, 400)
  if (semver.gte(process.version, '20.0.0')) {
    t.assert.deepStrictEqual(res.json(), {
      data: null,
      errors: [
        {
          message:
            "Body is not valid JSON but content-type is set to 'application/json'"
        }
      ]
    })
  } else {
    t.assert.deepStrictEqual(res.json(), {
      data: null,
      errors: [{ message: 'Unexpected token h in JSON at position 1' }]
    })
  }
})

test('bad json with custom error formatter and custom context', async (t) => {
  const schema = `
    type Query {
      successful: String
    }
  `

  const resolvers = {
    Query: {
      successful () {
        t.assert.assert.fail('Should not be called')
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    context: (_request, _reply) => ({ customValue: true }),
    errorFormatter: (_execution, context) => {
      t.assert.strictEqual(context.customValue, true)
      t.assert.ok('custom error formatter called')
      return {
        statusCode: 400,
        response: { data: null, errors: [{ message: 'Unexpected token h' }] }
      }
    }
  })

  await app.ready()

  const res = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: 'this is not a json',
    url: '/graphql'
  })

  t.assert.strictEqual(res.statusCode, 400)
  t.assert.deepStrictEqual(res.json(), {
    data: null,
    errors: [{ message: 'Unexpected token h' }]
  })
})

test('bad json with custom error handler', async (t) => {
  t.plan(3)
  const schema = `
    type Query {
      successful: String
    }
  `

  const resolvers = {
    Query: {
      successful () {
        t.assert.fail('Should not be called')
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    errorHandler: (_, request, reply) => {
      t.assert.ok('custom error handler called')
      reply.code(400).send({
        is: 'error'
      })
    }
  })

  await app.ready()

  const res = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: 'this is not a json',
    url: '/graphql'
  })

  t.assert.strictEqual(res.statusCode, 400)
  t.assert.deepStrictEqual(res.json(), {
    is: 'error'
  })
})

test('bad json with custom error handler, custom error formatter and custom context', async (t) => {
  const schema = `
    type Query {
      successful: String
    }
  `

  const resolvers = {
    Query: {
      successful () {
        t.assert.fail('Should not be called')
        return 'Runs OK'
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    context: (_request, _reply) => ({ customValue: true }),

    errorHandler: (_, request, reply) => {
      t.assert.strictEqual(request[kRequestContext].customValue, true)
      t.assert.ok('custom error handler called')
      reply.code(400).send({
        is: 'error'
      })
    }
  })

  await app.ready()

  const res = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: 'this is not a json',
    url: '/graphql'
  })

  t.assert.strictEqual(res.statusCode, 400)
  t.assert.deepStrictEqual(res.json(), {
    is: 'error'
  })
})

test('errors - should default to `statusCode` from error if present, when there is a single error and no data in the response', async (t) => {
  t.plan(2)

  const schema = `
    type Query {
      error: String!
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new ErrorWithProps('Conflict Error', undefined, 409)
      }
    }
  }

  const app = Fastify()
  t.after(() => app.close())

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={error}'
  })

  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'Conflict Error',
        locations: [{ line: 1, column: 2 }],
        path: ['error']
      }
    ]
  })
  t.assert.strictEqual(res.statusCode, 409)
})

test('errors - should default to HTTP Status Code `200 OK` if multiple errors are present and no data in the response', async (t) => {
  t.plan(2)

  const schema = `
    type Query {
      errorOne: String
      errorTwo: String!
    }
  `

  const resolvers = {
    Query: {
      errorOne () {
        throw new ErrorWithProps('Error One', undefined, 500)
      },
      errorTwo () {
        throw new ErrorWithProps('Error Two', undefined, 500)
      }
    }
  }

  const app = Fastify()
  t.after(() => app.close())

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={errorOne errorTwo}'
  })

  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'Error One',
        locations: [{ line: 1, column: 2 }],
        path: ['errorOne']
      },
      {
        message: 'Error Two',
        locations: [{ line: 1, column: 11 }],
        path: ['errorTwo']
      }
    ]
  })
  t.assert.strictEqual(res.statusCode, 200)
})

test('errors - should default to HTTP Status Code `400 Bad Request` if GraphQL validation fails', async (t) => {
  t.plan(2)

  const schema = `
    type Query {
      error: String
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new ErrorWithProps('Error', undefined, 500)
      }
    }
  }

  const app = Fastify()
  t.after(() => app.close())

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={wrong}'
  })

  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'Cannot query field "wrong" on type "Query".',
        locations: [{ line: 1, column: 2 }]
      }
    ]
  })
  t.assert.strictEqual(res.statusCode, 400)
})

test('errors - should default to HTTP Status Code `200 OK` if single error present but no status code defined', async (t) => {
  t.plan(2)

  const schema = `
    type Query {
      error: String!
    }
  `

  const resolvers = {
    Query: {
      error () {
        throw new Error('Error')
      }
    }
  }

  const app = Fastify()
  t.after(() => app.close())

  app.register(GQL, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={error}'
  })

  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'Error',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['error']
      }
    ]
  })
  t.assert.strictEqual(res.statusCode, 200)
})

test('errors - return GraphQLError when `error.originalError.errors` is of type array', async (t) => {
  t.plan(2)

  const schema = `
    type Query {
      errors: [String!]!
    }
  `

  const app = Fastify()
  t.after(() => app.close())

  app.register(GQL, {
    schema,
    resolvers: {
      Query: {
        errors () {
          throw new ErrorWithProps('Error', undefined, 500)
        }
      }
    }
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={array}'
  })

  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'Cannot query field "array" on type "Query".',
        locations: [{ line: 1, column: 2 }]
      }
    ]
  })
  t.assert.strictEqual(res.statusCode, 400)
})

test('errors - return error when `error.originalError.errors` is not an array or not defined', async (t) => {
  t.plan(2)

  const schema = `
    type Query {
      errorArray: [String!]!
    }
  `
  const app = Fastify()
  t.after(() => app.close())

  app.register(GQL, {
    schema,
    resolvers: {}
  })

  await app.ready()

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={errorArray}'
  })

  t.assert.deepStrictEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'Cannot return null for non-nullable field Query.errorArray.',
        locations: [{ line: 1, column: 2 }],
        path: ['errorArray']
      }
    ]
  })
  t.assert.strictEqual(res.statusCode, 200)
})
