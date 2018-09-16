'use strict'

module.exports = async function (app, opts) {
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
      response: {
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
