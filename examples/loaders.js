'use strict'

const Fastify = require('fastify')
const mercurius = require('..')

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
`

const resolvers = {
  Query: {
    dogs (_, params, { reply }) {
      return dogs
    }
  }
}

const loaders = {
  Dog: {
    async owner (queries, { reply }) {
      return queries.map(({ obj }) => owners[obj.name])
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  loaders,
  graphiql: true
})

app.listen({ port: 3000 })
