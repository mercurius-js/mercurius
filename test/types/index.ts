import Fastify from 'fastify'
import GQL from '../..'

const app = Fastify()

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_: any, { x, y }: { x: number, y: number }) => x + y
  }
}

app.register(GQL, {
  schema,
  resolvers
})

app.register(async function (app) {
  app.graphql.extendSchema(`extend type Query {
    subtract(x: Int, y: Int): Int
  }`)
  app.graphql.defineResolvers({
    Query: {
      subtract: async (_: any, { x, y }: { x: number, y: number }) => x - y
    }
  })
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)
