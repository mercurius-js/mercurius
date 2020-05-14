'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')
const { ErrorWithProps } = GQL

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
  t.deepEqual(JSON.parse(res.payload), {
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
  t.deepEqual(JSON.parse(res.payload), {
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
  t.deepEqual(JSON.parse(res.payload), {
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
  t.deepEqual(JSON.parse(res.payload), {
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
