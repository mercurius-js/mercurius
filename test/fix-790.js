'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('Subscription type is not treated as a subscription when subscriptions disabled', async (t) => {
  const schema = `
    type Query {
      subscription: Subscription!
    }

    type Subscription {
      id: ID!
    }
  `

  const resolvers = {
    Query: {
      subscription: () => ({ id: '1' })
    },

    Subscription: {
      id: () => '1'
    }
  }

  const app = Fastify()
  app.register(GQL, {
    schema,
    resolvers,
    subscription: false
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ subscription { id } }'
  const result = await app.graphql(query)
  t.same(result, {
    data: {
      subscription: {
        id: '1'
      }
    }
  })
})

test('Subscription type is not treated as a subscription by default', async (t) => {
  const schema = `
    type Query {
      subscription: Subscription!
    }

    type Subscription {
      id: ID!
    }
  `

  const resolvers = {
    Query: {
      subscription: () => ({ id: '1' })
    },

    Subscription: {
      id: () => '1'
    }
  }

  const app = Fastify()
  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ subscription { id } }'
  const result = await app.graphql(query)
  t.same(result, {
    data: {
      subscription: {
        id: '1'
      }
    }
  })
})
