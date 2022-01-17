'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')
const FakeTimers = require('@sinonjs/fake-timers')

async function createTestService (port, schema, resolvers = {}) {
  const service = Fastify()
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
  })
  await service.listen(port)
  return service
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

const userService = {
  schema: `
  extend type Query {
    me: User
  }
  
  type User @key(fields: "id") {
    id: ID!
    name: String!
  }
  `,
  resolvers: {
    Query: {
      me: () => {
        return users.u1
      }
    },
    User: {
      __resolveReference: user => {
        return users[user.id]
      }
    }
  }
}

const postService = {
  schema: `
  type Post @key(fields: "pid") {
    pid: ID!
    title: String
    content: String
    author: User @requires(fields: "pid title")
  }

  type User @key(fields: "id") @extends {
    id: ID! @external
    name: String @external
    posts(count: Int): [Post]
  }
`,
  resolvers: {
    Post: {
      author: post => {
        return {
          __typename: 'User',
          id: post.authorId
        }
      }
    },
    User: {
      posts: (user, { count }) => {
        return Object.values(posts).filter(p => p.authorId === user.id).slice(0, count)
      }
    }
  }
}

test('gateway retry failed services', async (t) => {
  t.plan(2)
  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 50
  })

  const service1 = await createTestService(5001, userService.schema, userService.resolvers)

  let service2 = null
  setTimeout(async () => {
    service2 = await createTestService(5002, postService.schema, postService.resolvers)
  }, 3000)

  const app = Fastify()
  t.teardown(async () => {
    await app.close()
    await service1.close()
    await service2.close()
    clock.uninstall()
  })

  app.register(GQL, {
    graphiql: true,
    jit: 1,
    gateway: {
      services: [
        {
          name: 'user',
          url: 'http://localhost:5001/graphql'
        },
        {
          name: 'post',
          url: 'http://localhost:5002/graphql'
        }
      ]
    }
  })

  await app.listen(5000)

  const query = `
    query {
      user: me {
        id
        name
        posts(count: 1) {
          pid
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
    errors: [
      {
        message: 'Cannot query field "posts" on type "User".',
        locations: [{ line: 6, column: 9 }]
      }
    ],
    data: null
  })

  await clock.runAllAsync()

  const res1 = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res1.body), {
    data: {
      user: {
        id: 'u1',
        name: 'John',
        posts: [
          {
            pid: 'p1'
          }
        ]
      }
    }
  })
})
