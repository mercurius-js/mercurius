'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

const schema = `
type Query {
  me: User
}

type Metadata {
  info: String!
}

type User {
  id: ID!
  name: String!
  quote(input: String!): String!
  metadata(input: String!): Metadata!
}`

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

const resolvers = {
  Query: {
    me: (root, args, context, info) => {
      return users.u1
    }
  },
  User: {
    quote: (user, args, context, info) => {
      return args.input
    },
    metadata: (user, args, context, info) => {
      return {
        info: args.input
      }
    }
  }
}

function createTestServer (t, customResolvers = resolvers) {
  const app = Fastify()
  t.teardown(app.close.bind(app))
  app.register(GQL, { schema, resolvers: customResolvers })
  return app
}

test('should support aliases', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  const query = `
    query {
      user: me {
        id
        name
        newName: name
        otherName: name
        quote(input: "quote")
        firstQuote: quote(input: "foo")
        secondQuote: quote(input: "bar")
        metadata(input: "info") {
          info
        }
        originalMetadata: metadata(input: "hello") {
          hi: info
          ho: info
        }
        moreMetadata: metadata(input: "hi") {
          info
        }
      }
    }`

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      user: {
        id: 'u1',
        name: 'John',
        newName: 'John',
        otherName: 'John',
        quote: 'quote',
        firstQuote: 'foo',
        secondQuote: 'bar',
        metadata: {
          info: 'info'
        },
        originalMetadata: {
          hi: 'hello',
          ho: 'hello'
        },
        moreMetadata: {
          info: 'hi'
        }
      }
    }
  })
})
