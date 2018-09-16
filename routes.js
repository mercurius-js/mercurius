'use strict'

const responseSchema = {
  '2xx': {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        additionalProperties: true
      }
    }
  }
}

module.exports = async function (app, opts) {
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
  }, async function (request, reply) {
    let {
      query,
      variables,
      operationName
    } = request.query

    if (variables) {
      variables = JSON.parse(variables)
    }

    return reply.graphql(query, null, variables, operationName)
  })

  app.post('/graphql', {
    schema: {
      body: {
        type: 'object',
        properties: {
          query: {
            type: 'string'
          },
          operationName: {
            type: 'string'
          },
          variables: {
            type: 'object',
            additionalProperties: true
          }
        }
      },
      response: responseSchema
    }
  }, async function (request, reply) {
    const {
      query,
      variables,
      operationName
    } = request.body

    return reply.graphql(query, null, variables, operationName)
  })
}
