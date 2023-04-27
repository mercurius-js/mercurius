'use strict'

const Fastify = require('fastify')
const mercurius = require('..')

// Define the constraint custom strategy
const schemaStrategy = {
  name: 'schema',
  storage: function () {
    const handlers = {}
    return {
      get: (type) => { return handlers[type] || null },
      set: (type, store) => { handlers[type] = store }
    }
  },
  deriveConstraint: (req, ctx) => {
    return req.headers.schema
  },
  validate: () => true,
  mustMatchWhenDerived: true
}

// Initialize fastify
const app = Fastify({ constraints: { schema: schemaStrategy } })

// Schema 1 definition
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

// Schema A registration with A constraint
app.register(async childServer => {
  childServer.register(mercurius, {
    schema,
    resolvers,
    graphiql: false,
    routes: false
  })

  childServer.route({
    path: '/',
    method: 'POST',
    constraints: { schema: 'A' },
    handler: (req, reply) => {
      const query = req.body
      return reply.graphql(query)
    }
  })
})

const schema2 = `
  type Query {
    subtract(x: Int, y: Int): Int
  }
`

const resolvers2 = {
  Query: {
    subtract: async (_, obj) => {
      const { x, y } = obj
      return x - y
    }
  }
}

app.register(async childServer => {
  childServer.register(mercurius, {
    schema: schema2,
    resolvers: resolvers2,
    graphiql: false,
    routes: false
  })

  childServer.route({
    path: '/',
    method: 'POST',
    constraints: { schema: 'B' },
    handler: (req, reply) => {
      const query = req.body
      return reply.graphql(query)
    }
  })
})

app.listen({ port: 3000 })
