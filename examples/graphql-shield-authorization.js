'use strict'

const Fastify = require('fastify')
const mercurius = require('..')
const { makeExecutableSchema } = require('@graphql-tools/schema')
// See https://github.com/maticzav/graphql-shield for docs and additional examples
const { rule, shield, and, or, not } = require('graphql-shield')
const { applyMiddleware } = require('graphql-middleware')

const app = Fastify()

const typeDefs = `
  type Query {
    frontPage: [Fruit!]!
    fruits: [Fruit!]!
    customers: [Customer!]!
  }
  type Mutation {
    addFruitToBasket: Boolean!
  }
  type Fruit {
    name: String!
    count: Int!
  }
  type Customer {
    id: ID!
    basket: [Fruit!]!
  }

`

const resolvers = {
  Query: {
    frontPage: () => [
      { name: 'orange', count: 10 },
      { name: 'apple', count: 1 }
    ],
    fruits: () => [
      { name: 'orange', count: 10 },
      { name: 'apple', count: 1 },
      { name: 'strawberries', count: 100 }
    ],
    customers: () => [
      { id: 1, basket: [{ name: 'orange', count: 1 }] },
      { id: 2, basket: [{ name: 'apple', count: 2 }] }
    ]
  },
  Mutation: {
    addFruitToBasket: () => true
  }
}

// Auth
const users = {
  alice: {
    id: 1,
    name: 'Alice',
    role: 'admin'
  },
  bob: {
    id: 2,
    name: 'Bob',
    role: 'editor'
  },
  johnny: {
    id: 3,
    name: 'Johnny',
    role: 'customer'
  }
}

function getUser (req) {
  const auth = req.headers.authorization // Headers can be provided within GraphQL Playground, e.g { "authorization": "alice" }
  if (users[auth]) {
    return users[auth]
  } else {
    return null
  }
}

// Rules
const isAuthenticated = rule({ cache: 'contextual' })(
  async (parent, args, ctx, info) => {
    return ctx.user !== null
  }
)

const isAdmin = rule({ cache: 'contextual' })(
  async (parent, args, ctx, info) => {
    return ctx.user.role === 'admin'
  }
)

const isEditor = rule({ cache: 'contextual' })(
  async (parent, args, ctx, info) => {
    return ctx.user.role === 'editor'
  }
)

// Permissions
const permissions = shield({
  Query: {
    frontPage: not(isAuthenticated), // Note: remove authorization header; public query
    fruits: and(isAuthenticated, or(isAdmin, isEditor)),
    customers: and(isAuthenticated, isAdmin)
  },
  Mutation: {
    addFruitToBasket: isAuthenticated
  },
  Customer: isAdmin
})

const schema = makeExecutableSchema({ typeDefs, resolvers })

const schemaWithMiddleware = applyMiddleware(schema, permissions)

app.register(mercurius, {
  schema: schemaWithMiddleware,
  graphiql: 'playground',
  context: (req) => ({
    ...req,
    user: getUser(req)
  })
})

app.listen(3000)
