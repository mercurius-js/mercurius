'use strict'

const Fastify = require('fastify')
const mercurius = require('..')
const { schema, resolvers } = require('./standalone-setup')

const app = Fastify()

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: false,
  jit: 1
})

app.listen({ port: 3000 })
