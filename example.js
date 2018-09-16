'use strict'

const Fastify = require('fastify')
const GQL = require('.')

const app = Fastify()

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const root = {
  add: async ({ x, y }) => x + y
}

app.register(GQL, {
  schema,
  root
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)
