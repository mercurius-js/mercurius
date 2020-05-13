'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')
const { ErrorWithProps } = GQL

test('errors - multiple extended errors', async (t) => {
  const schema = `
    type Query {
      errorOne: String
      errorTwo: String
      successful: String
    }
  `

  const resolvers = {
    Query: {
      errorOne () {
        throw new ErrorWithProps('Error One', { code: 'ERROR_ONE', additional: 'information one', other: 'data one' })
      },
      errorTwo () {
        throw new ErrorWithProps('Error Two', { code: 'ERROR_TWO', additional: 'information two', other: 'data two' })
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
    url: '/graphql?query={errorOne,errorTwo, successful}'
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.payload), {
    data: {
      errorOne: null,
      errorTwo: null,
      successful: 'Runs OK'
    },
    errors: [
      {
        message: 'Error One',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['errorOne'],
        extensions: {
          code: 'ERROR_ONE',
          additional: 'information one',
          other: 'data one'
        }
      },
      {
        message: 'Error Two',
        locations: [
          {
            line: 1,
            column: 11
          }
        ],
        path: ['errorTwo'],
        extensions: {
          code: 'ERROR_TWO',
          additional: 'information two',
          other: 'data two'
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
