'use strict'

const { join } = require('path')
const Static = require('fastify-static')
const { BadRequest } = require('http-errors')

const responseSchema = {
  '2xx': {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        additionalProperties: true
      }
      // TODO make this include errors
    }
  }
}

module.exports = async function (app, opts) {
  app.setErrorHandler(async function (err, request, reply) {
    if (!err.statusCode) {
      throw err
    }

    reply.code(err.statusCode)
    if (err.errors) {
      return { errors: err.errors }
    } else {
      return {
        message: err.message
      }
    }
  })

  app.get('/graphql', {
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
    }
  }, function (request, reply) {
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

    return reply.graphql(query, null, variables, operationName)
  })

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
    }
  }, function (request, reply) {
    const {
      query,
      variables,
      operationName
    } = request.body

    return reply.graphql(query, null, variables, operationName)
  })

  if (opts.graphiql) {
    app.register(Static, {
      root: join(__dirname, 'static')
    })

    app.get('/graphiql', (req, reply) => {
      reply.redirect('/graphiql.html')
    })
  }
}
