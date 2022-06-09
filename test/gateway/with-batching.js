'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createTestService (t, schema, resolvers = {}, allowBatchedQueries = false) {
  const service = Fastify()
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true,
    allowBatchedQueries
  })
  await service.listen({ port: 0 })
  return [service, service.server.address().port]
}

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

const posts = {
  p1: {
    pid: 'p1',
    title: 'Post 1',
    content: 'Content 1',
    authorId: 'u1'
  },
  p2: {
    pid: 'p2',
    title: 'Post 2',
    content: 'Content 2',
    authorId: 'u2'
  },
  p3: {
    pid: 'p3',
    title: 'Post 3',
    content: 'Content 3',
    authorId: 'u1'
  },
  p4: {
    pid: 'p4',
    title: 'Post 4',
    content: 'Content 4',
    authorId: 'u1'
  }
}

async function createTestGatewayServer (t, allowBatchedQueries = false) {
  // User service
  const userServiceSchema = `
  type Query @extends {
    me: User
  }

  type Metadata {
    info: String!
  }

  type User @key(fields: "id") {
    id: ID!
    name: String!
    quote(input: String!): String!
    metadata(input: String!): Metadata!
  }`
  const userServiceResolvers = {
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
      },
      __resolveReference: (user, args, context, info) => {
        return users[user.id]
      }
    }
  }
  const [userService, userServicePort] = await createTestService(t, userServiceSchema, userServiceResolvers, allowBatchedQueries)

  // Post service
  const postServiceSchema = `
  type Post @key(fields: "pid") {
    pid: ID!
  }

  type User @key(fields: "id") @extends {
    id: ID! @external
    topPosts(count: Int!): [Post]
  }`
  const postServiceResolvers = {
    User: {
      topPosts: (user, { count }, context, info) => {
        return Object.values(posts).filter(p => p.authorId === user.id).slice(0, count)
      }
    }
  }
  const [postService, postServicePort] = await createTestService(t, postServiceSchema, postServiceResolvers, allowBatchedQueries)

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await userService.close()
    await postService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`,
        allowBatchedQueries
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`,
        allowBatchedQueries
      }]
    }
  })
  return gateway
}

test('it returns the same data if batching is enabled', async (t) => {
  t.plan(1)
  const app1 = await createTestGatewayServer(t)
  const app2 = await createTestGatewayServer(t, true)

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
        somePosts: topPosts(count: 1) {
          pid
        }
        morePosts: topPosts(count: 2) {
          pid
        }
      }
    }`

  const res1 = await app1.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  await app1.close()

  const res2 = await app2.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res1.body), JSON.parse(res2.body))
})
