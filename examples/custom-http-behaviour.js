'use strict'

const Fastify = require('fastify')
const mercurius = require('..')

const app = Fastify()

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

/**
 * Define error formatter so we always return 200 OK
 */
function errorFormatter (err, ctx) {
  const response = mercurius.defaultErrorFormatter(err, ctx)
  response.statusCode = 200
  return response
}

app.register(mercurius, {
  schema,
  resolvers,
  errorFormatter
})

app.listen({ port: 3000 })
