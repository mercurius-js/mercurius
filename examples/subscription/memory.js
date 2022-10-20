'use strict'

const mercurius = require('../..')
const Fastify = require('fastify')

const app = Fastify({ logger: { level: 'debug' } })

// list of products
const products = []

// graphql schema
const schema = `
  type Product {
    name: String!
    state: String!
  }

  type Query {
    products: [Product]
  }

  type Mutation {
    addProduct(name: String!, state: String!): Product
  }

  type Subscription {
    productAdded: Product
  }
`

// graphql resolvers
const resolvers = {
  Query: {
    products: () => products
  },
  Mutation: {
    addProduct: async (_, { name, state }, { pubsub }) => {
      const product = { name, state }

      products.push(product)

      pubsub.publish({
        topic: 'new_product_updates',
        payload: {
          productAdded: product
        }
      })

      return product
    }
  },
  Subscription: {
    productAdded: {
      subscribe: async (_, __, { pubsub }) => {
        return await pubsub.subscribe('new_product_updates')
      }
    }
  }
}

// server start
const start = async () => {
  try {
    // register GraphQl
    app.register(mercurius, {
      schema,
      resolvers,
      graphiql: true,
      subscription: {
        async onConnect ({ payload }) {
          app.log.info({ payload }, 'connection_init data')
          return true
        }
      }
    })

    // start server
    await app.listen({ port: 3000 })
  } catch (error) {
    app.log.error(error)
  }
}

start()
