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
    return reply.graphql(request.body.query, null, request.body.variables)
  })
}
