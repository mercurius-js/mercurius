'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')
const { FastifyGraphQLError } = require('../lib/errors')

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
        throw new FastifyGraphQLError('Error One', 'ERROR_ONE', { additional: 'information one', other: 'data one' })
      },
      errorTwo () {
        throw new FastifyGraphQLError('Error Two', 'ERROR_TWO', { additional: 'information two', other: 'data two' })
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

  // needed so that graphql is defined
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

test('errors - extended errors with number additionalProperties', async (t) => {
  const schema = `
    type Query {
      willThrow: String
    }
  `

  const resolvers = {
    Query: {
      willThrow () {
        throw new FastifyGraphQLError('extended Error', 'extended_ERROR', { floating: 3.14, timestamp: 1324356 })
      }
    }
  }

  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
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
        message: 'extended Error',
        locations: [
          {
            line: 1,
            column: 2
          }
        ],
        path: ['willThrow'],
        extensions: {
          code: 'extended_ERROR',
          floating: 3.14,
          timestamp: 1324356
        }
      }
    ]
  })
})
