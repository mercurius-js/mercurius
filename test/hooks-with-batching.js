'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const sinon = require('sinon')
const GQL = require('..')

test('batched query has an individual context for each operation through all the lifecycle hooks', async (t) => {
  const app = Fastify()

  const preParsingSpy = sinon.spy()
  const preValidationSpy = sinon.spy()
  const preExecutionSpy = sinon.spy()
  const onResolutionSpy = sinon.spy()

  const schema = `
      type Query {
        test: String
      }
    `

  const resolvers = {
    test: () => 'test'
  }

  await app.register(GQL, {
    schema,
    resolvers,
    allowBatchedQueries: true
  })

  app.graphql.addHook('preParsing', (_, __, ctx) => {
    preParsingSpy(ctx.operationId, ctx.operationsCount, ctx.__currentQuery)
  })

  app.graphql.addHook('preValidation', (_, __, ctx) => {
    preValidationSpy(ctx.operationId, ctx.operationsCount, ctx.__currentQuery)
  })

  app.graphql.addHook('preExecution', (_, __, ctx) => {
    preExecutionSpy(ctx.operationId, ctx.operationsCount, ctx.__currentQuery)
  })

  app.graphql.addHook('onResolution', (_, ctx) => {
    onResolutionSpy(ctx.operationId, ctx.operationsCount, ctx.__currentQuery)
  })

  await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [
      {
        operationName: 'TestQuery',
        query: 'query TestQuery { test }'
      },
      {
        operationName: 'DoubleQuery',
        query: 'query DoubleQuery { test }'
      }
    ]
  })

  sinon.assert.calledTwice(preParsingSpy)
  sinon.assert.calledWith(preParsingSpy, 0, 2, sinon.match(/TestQuery/))
  sinon.assert.calledWith(preParsingSpy, 1, 2, sinon.match(/DoubleQuery/))

  sinon.assert.calledTwice(preValidationSpy)
  sinon.assert.calledWith(preValidationSpy, 0, 2, sinon.match(/TestQuery/))
  sinon.assert.calledWith(preValidationSpy, 1, 2, sinon.match(/DoubleQuery/))

  sinon.assert.calledTwice(preExecutionSpy)
  sinon.assert.calledWith(preExecutionSpy, 0, 2, sinon.match(/TestQuery/))
  sinon.assert.calledWith(preExecutionSpy, 1, 2, sinon.match(/DoubleQuery/))

  sinon.assert.calledTwice(onResolutionSpy)
  sinon.assert.calledWith(onResolutionSpy, 0, 2, sinon.match(/TestQuery/))
  sinon.assert.calledWith(onResolutionSpy, 1, 2, sinon.match(/DoubleQuery/))
})
