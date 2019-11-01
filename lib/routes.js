'use strict'

const { join } = require('path')
const Static = require('fastify-static')
const { BadRequest } = require('http-errors')
const { formatError, GraphQLError } = require('graphql')
const mq = require('mqemitter')
const { PubSub } = require('./subscriber')
const subscription = require('./subscription')

const responseSchema = {
  '2xx': {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        additionalProperties: true
      },
      errors: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          locations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                line: { type: 'integer' },
                column: { type: 'integer' }
              }
            }
          },
          path: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }
}

async function defaultErrorHandler (err, request, reply) {
  if (!err.statusCode) {
    throw err
  }

  reply.code(err.statusCode)
  if (err.errors) {
    const errors = err.errors.map(error => {
      return error instanceof GraphQLError ? formatError(error) : { message: error.message }
    })

    return { errors }
  } else {
    return {
      errors: [
        { message: err.message }
      ]
    }
  }
}

function validationHandler (validationError) {
  if (validationError) {
    const err = new BadRequest()
    err.errors = [validationError]
    throw err
  }
}

module.exports = async function (app, opts) {
  if (typeof opts.errorHandler === 'function') {
    app.setErrorHandler(opts.errorHandler)
  } else if (opts.errorHandler === true || opts.errorHandler === undefined) {
    app.setErrorHandler(defaultErrorHandler)
  }
  const contextFn = opts.context

  const subscriptionOpts = opts.subscription
  let emitter
  let subscriber
  let verifyClient

  if (typeof subscriptionOpts === 'object') {
    emitter = subscriptionOpts.emitter || mq()
    verifyClient = subscriptionOpts.verifyClient
  } else if (subscriptionOpts === true) {
    emitter = mq()
  }

  if (subscriptionOpts) {
    subscriber = new PubSub(emitter)
  }

  const getOptions = {
    url: '/graphql',
    method: 'GET',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          query: {
            type: 'string'
          },
          operationName: {
            type: 'string'
          },
          variables: { // this is a JSON
            type: 'string'
          }
        }
      },
      response: responseSchema
    },
    attachValidation: true,
    handler: async function (request, reply) {
      validationHandler(request.validationError)

      let {
        query,
        variables,
        operationName
      } = request.query

      if (variables) {
        try {
          variables = JSON.parse(variables)
        } catch (err) {
          request.log.info({ err: err })
          reply.send(new BadRequest(err.message))
          return
        }
      }

      let context = {}
      if (contextFn) {
        context = await contextFn(request, reply)
      }

      return reply.graphql(query, { pubsub: subscriber, ...context }, variables, operationName)
    }
  }

  if (subscriptionOpts) {
    app.register(subscription, {
      getOptions,
      schema: opts.schema,
      subscriber,
      verifyClient
    })
  } else {
    app.route(getOptions)
  }

  app.post('/graphql', {
    schema: {
      body: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'the GraphQL query'
          },
          operationName: {
            type: 'string'
          },
          variables: {
            type: ['object', 'null'],
            additionalProperties: true
          }
        }
      },
      response: responseSchema
    },
    attachValidation: true
  }, async function (request, reply) {
    validationHandler(request.validationError)

    const {
      query,
      variables,
      operationName
    } = request.body

    let context = {}
    if (contextFn) {
      context = await contextFn(request, reply)
    }

    return reply.graphql(query, { pubsub: subscriber, ...context }, variables, operationName)
  })

  if (opts.graphiql) {
    app.register(Static, {
      root: join(__dirname, '../static'),
      wildcard: false
    })
    if (opts.graphiql === true || opts.graphiql === 'graphiql') {
      app.get('/graphiql', (req, reply) => {
        reply.redirect(`${app.prefix}/graphiql.html`)
      })
    }
    if (opts.graphiql === 'playground') {
      app.get('/playground', (req, reply) => {
        reply.redirect(`${app.prefix}/playground.html`)
      })
    }
  }
}
