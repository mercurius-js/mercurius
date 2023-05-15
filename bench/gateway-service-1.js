'use strict'

const Fastify = require('fastify')
const mercurius = require('..')

const app = Fastify()

const users = {
  u1: {
    id: 'u1',
    name: 'John'
  },
  u2: {
    id: 'u2',
    name: 'Jane'
  }
}

const schema = `
directive @auth(
  requires: Role = ADMIN,
) on OBJECT | FIELD_DEFINITION

enum Role {
  ADMIN
  REVIEWER
  USER
  UNKNOWN
}

type Query @extends {
  me: User
}

type User @key(fields: "id") {
  id: ID!
  name: String! @auth(requires: ADMIN)
}`

const resolvers = {
  Query: {
    me: (root, args, context, info) => {
      return users.u1
    }
  },
  User: {
    __resolveReference: (user, args, context, info) => {
      return users[user.id]
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  federationMetadata: true,
  graphiql: false,
  jit: 1
})

app.listen({ port: 3001 })
