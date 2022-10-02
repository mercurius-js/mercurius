'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createTestService (t, schema, resolvers = {}) {
  const service = Fastify()
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true,
    allowBatchedQueries: true
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
    authorId: 'u1'
  },
  p2: {
    pid: 'p2',
    authorId: 'u2'
  },
  p3: {
    pid: 'p3',
    authorId: 'u1'
  },
  p4: {
    pid: 'p4',
    authorId: 'u1'
  },
  p5: {
    pid: 'p5',
    authorId: 'u2'
  },
  p6: {
    pid: 'p6',
    authorId: 'u1'
  }
}

async function createTestGatewayServer (t) {
  // User service
  const userServiceSchema = `
  type Query @extends {
    me: User
  }

  type User @key(fields: "id") {
    id: ID!
    name: String!
  }`
  const userServiceResolvers = {
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
  const [userService, userServicePort] = await createTestService(t, userServiceSchema, userServiceResolvers)

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
  const [postService, postServicePort] = await createTestService(t, postServiceSchema, postServiceResolvers)

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
        allowBatchedQueries: true
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`,
        allowBatchedQueries: true
      }]
    }
  })
  return gateway
}

test('gateway: resolverKey should support digits', async (t) => {
  t.plan(7)
  const app = await createTestGatewayServer(t)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query {
          user1: me {
            id
            somePostsOne: topPosts(count: 1) {
              pid
            }
            somePostsTwo: topPosts(count: 2) {
              pid
            }
            somePosts1: topPosts(count: 1) {
              pid
            }
            somePosts2: topPosts(count: 2) {
              pid
            }
            some3Posts: topPosts(count: 3) {
              pid
            }
          }
          user2: me {
            id
            somePostsOne: topPosts(count: 2) {
              pid
            }
            somePostsTwo: topPosts(count: 1) {
              pid
            }
            somePosts1: topPosts(count: 2) {
              pid
            }
            somePosts2: topPosts(count: 1) {
              pid
            }
            some3Posts: topPosts(count: 4) {
              pid
            }
          }
        }`
    })
  })

  const resParsed = JSON.parse(res.body).data

  // Verify user1 res
  t.same(resParsed.user1.somePostsOne, resParsed.user1.somePosts1)
  t.same(resParsed.user1.somePostsTwo, resParsed.user1.somePosts2)
  t.notSame(resParsed.user1.somePosts2, resParsed.user1.some3Posts)
  // Verify user2 res
  t.same(resParsed.user2.somePostsOne, resParsed.user2.somePosts1)
  t.same(resParsed.user2.somePostsTwo, resParsed.user2.somePosts2)
  t.notSame(resParsed.user2.somePosts2, resParsed.user2.some3Posts)
  // Verify user1 vs user2 res
  t.notSame(resParsed.user1, resParsed.user2)
})
