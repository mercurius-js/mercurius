'use strict'

const t = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')
const { MER_ERR_GQL_GATEWAY_DUPLICATE_DIRECTIVE } = require('../../lib/errors')

async function createTestService (t, schema, resolvers = {}) {
  const service = Fastify()
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

const query = `
  query {
    me {
      id
      name
      topPosts(count: 2) {
        pid
        author {
          id
        }
      }
    }
    topPosts(count: 2) {
      pid
    }
  }
`

async function createUserService (directiveDefinition) {
  const userServiceSchema = `
  ${directiveDefinition}

  type Query @extends {
    me: User @custom
  }

  type User @key(fields: "id") {
    id: ID!
    name: String! @custom
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
  return createTestService(t, userServiceSchema, userServiceResolvers)
}

async function createPostService (directiveDefinition) {
  const postServiceSchema = `
  ${directiveDefinition}

  type Post @key(fields: "pid") {
    pid: ID! @custom
    author: User
  }

  extend type Query {
    topPosts(count: Int): [Post]
  }

  type User @key(fields: "id") @extends {
    id: ID! @external
    topPosts(count: Int!): [Post]
  }`
  const postServiceResolvers = {
    Post: {
      __resolveReference: (post, args, context, info) => {
        return posts[post.pid]
      },
      author: (post, args, context, info) => {
        return {
          __typename: 'User',
          id: post.authorId
        }
      }
    },
    User: {
      topPosts: (user, { count }, context, info) => {
        return Object.values(posts).filter(p => p.authorId === user.id).slice(0, count)
      }
    },
    Query: {
      topPosts: (root, { count = 2 }) => Object.values(posts).slice(0, count)
    }
  }
  return createTestService(t, postServiceSchema, postServiceResolvers)
}

t.test('gateway with batching', t => {
  t.plan(2)

  t.test('should de-duplicate custom directives on the gateway', async (t) => {
    t.plan(4)

    const [userService, userServicePort] = await createUserService('directive @custom(input: ID) on OBJECT | FIELD_DEFINITION')
    const [postService, postServicePort] = await createPostService('directive @custom(input: ID) on OBJECT | FIELD_DEFINITION')
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
    await gateway.ready()

    const userDirectiveNames = userService.graphql.schema.getDirectives().map(directive => directive.name)
    t.same(userDirectiveNames, [
      'include',
      'skip',
      'deprecated',
      'specifiedBy',
      'external',
      'requires',
      'provides',
      'key',
      'extends',
      'custom'
    ])

    const postDirectiveNames = userService.graphql.schema.getDirectives().map(directive => directive.name)
    t.same(postDirectiveNames, [
      'include',
      'skip',
      'deprecated',
      'specifiedBy',
      'external',
      'requires',
      'provides',
      'key',
      'extends',
      'custom'
    ])

    const gatewayDirectiveNames = gateway.graphql.schema.getDirectives().map(directive => directive.name)
    t.same(gatewayDirectiveNames, [
      'include',
      'skip',
      'deprecated',
      'specifiedBy',
      'custom'
    ])

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: 'John',
          topPosts: [
            {
              pid: 'p1',
              author: {
                id: 'u1'
              }
            },
            {
              pid: 'p3',
              author: {
                id: 'u1'
              }
            }
          ]
        },
        topPosts: [
          {
            pid: 'p1'
          },
          {
            pid: 'p2'
          }
        ]
      }
    })
  })

  t.test('should error on startup when different definitions of custom directives with the same name are present in federated services', async (t) => {
    t.plan(1)

    const [userService, userServicePort] = await createUserService('directive @custom(input: ID) on OBJECT | FIELD_DEFINITION')
    const [postService, postServicePort] = await createPostService('directive @custom(input: String) on OBJECT | FIELD_DEFINITION')
    const serviceOpts = {
      keepAliveTimeout: 10, // milliseconds
      keepAliveMaxTimeout: 10 // milliseconds
    }

    const gateway = Fastify()
    t.teardown(async () => {
      await gateway.close()
      await userService.close()
      await postService.close()
    })
    gateway.register(GQL, {
      gateway: {
        services: [
          {
            ...serviceOpts,
            name: 'user',
            url: `http://localhost:${userServicePort}/graphql`,
            allowBatchedQueries: true
          },
          {
            ...serviceOpts,
            name: 'post',
            url: `http://localhost:${postServicePort}/graphql`,
            allowBatchedQueries: true
          }
        ]
      }
    })

    await t.rejects(gateway.ready(), new MER_ERR_GQL_GATEWAY_DUPLICATE_DIRECTIVE('custom'))
  })
})
