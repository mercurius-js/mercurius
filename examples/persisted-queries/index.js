'use strict'

const Fastify = require('fastify')
const mercurius = require('../..')
const persistedQueries = require('./queries.json')

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

app.register(mercurius, {
  schema,
  resolvers,
  persistedQueries,
  onlyPersisted: true, // will nullify the effect of the option below (graphiql)
  graphiql: true
})

app.listen({ port: 3000 })
