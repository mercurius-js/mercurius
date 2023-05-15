import Fastify from 'fastify'
import mercurius from 'mercurius'

const app = Fastify({ logger: true })

let x = 0

const schema = `
  type ResultChange {
    operation: String
    prev: Int
    current: Int
  }
  type Query {
    result: Int
  }
  type Mutation {
    add(num: Int): Int
    subtract(num: Int): Int
  }
  type Subscription {
    onResultChange: ResultChange
  }
`

const resolvers = {
  Query: {
    result: async () => {
      return x
    }
  },
  Mutation: {
    add: async (_, args, { pubsub }) => {
      const prev = x
      const { num } = args

      x = prev + num

      pubsub.publish({
        topic: 'RESULT_TOPIC',
        payload: {
          onResultChange: {
            operation: 'add',
            prev,
            current: x
          }
        }
      })

      return x
    },
    subtract: async (_, args, { pubsub }) => {
      const prev = x
      const { num } = args

      x = prev - num

      pubsub.publish({
        topic: 'RESULT_TOPIC',
        payload: {
          onResultChange: {
            operation: 'subtract',
            prev,
            current: x
          }
        }
      })

      return x
    }
  },
  Subscription: {
    onResultChange: {
      subscribe: async (_, __, { pubsub }) => {
        return await pubsub.subscribe('RESULT_TOPIC')
      }
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: true,
  subscription: {
    fullWsTransport: true
  }
})

app.listen({ port: 4000 })
