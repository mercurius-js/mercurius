'use strict'

const mercurius = require('mercurius')
const Fastify = require('fastify')
const mongodbMQEmitter = require('mqemitter-mongodb')

const app = Fastify({ logger: true })

// mq
let emitter

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

const handle = (conn) => conn.pipe(conn)

// server start
const start = async () => {
  try {
    // initialize emitter
    emitter = mongodbMQEmitter({ url: 'mongodb://localhost/test' })

    // register GraphQl
    app.register(mercurius, {
      schema,
      resolvers,
      subscription: {
        emitter,
        handle
      }
    })

    // start server
    await app.listen({ port: 3000 })
  } catch (error) {
    app.log.error(error)
  }
}

start()
