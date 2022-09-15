'use strict'

const Fastify = require('fastify')
const mercurius = require('..')
const graphql = require('graphql')

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
  graphiql: true,
  validationRules: [graphql.NoSchemaIntrospectionCustomRule]
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen({ port: 3000 })
