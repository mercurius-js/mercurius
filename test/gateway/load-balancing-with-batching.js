'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createTestService (t, schema, resolvers = {}, fn = async () => {}) {
  const service = Fastify()
  service.addHook('preHandler', fn)
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true,
    allowBatchedQueries: true
  })
  await service.listen(0)
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

test('load balances two peers', async (t) => {
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
    metadata(input: String!): Metadata!
  }`
  const userServiceResolvers = {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    },
    User: {
      metadata: (user, args, context, info) => {
        return {
          info: args.input
        }
      }
    }
  }
  let user1called = 0
  let user2called = 0
  const [userService1, userServicePort1] = await createTestService(t, userServiceSchema, userServiceResolvers, async () => {
    user1called++
  })
  const [userService2, userServicePort2] = await createTestService(t, userServiceSchema, userServiceResolvers, async () => {
    user2called++
  })

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
    await userService1.close()
    await userService2.close()
    await postService.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: [`http://localhost:${userServicePort1}/graphql`, `http://localhost:${userServicePort2}/graphql`],
        allowBatchedQueries: true
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`,
        allowBatchedQueries: true
      }]
    }
  })
  await gateway

  const variables = {
    shouldSkip: true,
    input: 'hello'
  }
  const query = `
    query GetMe($input: String!, $shouldSkip: Boolean!) {
      me {
        id
        name
        metadata(input: $input) @skip(if: $shouldSkip) {
          info
        }
        topPosts(count: 1) @skip(if: $shouldSkip) {
          pid
        }
      }
    }`

  {
    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query, variables })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: 'John'
        }
      }
    })
  }

  {
    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query, variables })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: 'John'
        }
      }
    })
  }

  // Called two times, one to get the schema and one for the query
  t.equal(user1called, 2)

  // Called one time, one one for the query
  t.equal(user2called, 1)
})
