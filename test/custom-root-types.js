'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('redefine query', async (t) => {
  const schema = `
    schema {
      query: BetterQuery
    }

    type BetterQuery {
      q: Query
    }

    type Query {
      id: ID!
    }
  `

  const resolvers = {
    BetterQuery: {
      q: async () => ({ id: '1' })
    },

    Query: {
      id: async () => '1'
    }
  }

  const app = Fastify()
  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ q { id } }'
  const result = await app.graphql(query)
  t.same(result, {
    data: {
      q: {
        id: '1'
      }
    }
  })
})

test('redefined mutation type', async (t) => {
  const schema = `
    schema {
      query: Query
      mutation: BetterMutation
    }

    type BetterMutation {
      m: Mutation
    }

    type Mutation {
      name: String!
    }

    type Query {
      mut: Mutation!
    }
  `

  const resolvers = {
    BetterMutation: {
      m: async () => ({ name: 'Bobby' })
    },

    Mutation: {
      name: async () => 'Bobby'
    },

    Query: {
      mut: async () => ({ name: 'Bobby' })
    }
  }

  const app = Fastify()
  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const mutation = 'mutation { m { name } }'
  const res = await app.graphql(mutation)
  t.same(res, {
    data: {
      m: {
        name: 'Bobby'
      }
    }
  })
})
