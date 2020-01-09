import Fastify from 'fastify'
import GQL from '../..'

const app = Fastify()

const dogs = [{
  name: 'Max'
}, {
  name: 'Charlie'
}, {
  name: 'Buddy'
}, {
  name: 'Max'
}]

const owners = {
  Max: {
    name: 'Jennifer'
  },
  Charlie: {
    name: 'Sarah'
  },
  Buddy: {
    name: 'Tracy'
  }
}

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
  schema: schema,
  resolvers,
  loaders: {},
  ide: false,
  jit: 1,
  routes: true,
  prefix: '/prefix',
  defineMutation: false,
  errorHandler: true,
  queryDepth: 8
})

app.register(async function (app) {
  app.graphql.extendSchema(`
  type Human {
    name: String!
  }

  type Dog {
    name: String!
    owner: Human
  }

  type Query {
    dogs: [Dog]
  }
  `)
  app.graphql.defineResolvers({
    Query: {
      dogs (_, params, { reply }) {
        return dogs
      }
    }
  })
  app.graphql.defineLoaders({
    Dog: {
      async owner (queries: Array<{ obj: { name: keyof typeof owners } }>) {
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  })
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)
