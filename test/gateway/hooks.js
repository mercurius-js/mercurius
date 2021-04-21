'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { GraphQLSchema, parse } = require('graphql')
const { promisify } = require('util')
const GQL = require('../..')

const immediate = promisify(setImmediate)

async function createTestService (t, schema, resolvers = {}) {
  const service = Fastify()
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
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

async function createTestGatewayServer (t, opts = {}) {
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
  const [postService, postServicePort] = await createTestService(t, postServiceSchema, postServiceResolvers)

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await userService.close()
    await postService.close()
  })
  gateway.register(GQL, {
    ...opts,
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }]
    }
  })
  return gateway
}

// -----
// hooks
// -----
test('gateway - hooks', async (t) => {
  t.plan(32)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preParsing', async function (schema, source, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.ok('preParsing called')
  })

  app.graphql.addHook('preValidation', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preValidation called')
  })

  app.graphql.addHook('preExecution', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preExecution called')
  })

  // Execution events:
  //  - once for user service query
  //  - once for post service query
  //  - once for reference type topPosts on User
  //  - once for reference type author on Post
  app.graphql.addHook('preGatewayExecution', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    t.ok('preGatewayExecution called')
  })

  app.graphql.addHook('onResolution', async function (execution, context) {
    await immediate()
    t.type(execution, 'object')
    t.type(context, 'object')
    t.ok('onResolution called')
  })

  const res = await app.inject({
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

test('gateway - hooks validation should handle invalid hook names', async (t) => {
  t.plan(1)
  const app = await createTestGatewayServer(t)

  try {
    app.graphql.addHook('unsupportedHook', async () => {})
  } catch (e) {
    t.equal(e.message, 'unsupportedHook hook not supported!')
  }
})

test('gateway - hooks validation should handle invalid hook name types', async (t) => {
  t.plan(2)
  const app = await createTestGatewayServer(t)

  try {
    app.graphql.addHook(1, async () => {})
  } catch (e) {
    t.equal(e.code, 'MER_ERR_HOOK_INVALID_TYPE')
    t.equal(e.message, 'The hook name must be a string')
  }
})

test('gateway - hooks validation should handle invalid hook handlers', async (t) => {
  t.plan(2)
  const app = await createTestGatewayServer(t)

  try {
    app.graphql.addHook('preParsing', 'not a function')
  } catch (e) {
    t.equal(e.code, 'MER_ERR_HOOK_INVALID_HANDLER')
    t.equal(e.message, 'The hook callback must be a function')
  }
})

test('gateway - hooks should trigger when JIT is enabled', async (t) => {
  t.plan(60)
  const app = await createTestGatewayServer(t, { jit: 1 })

  app.graphql.addHook('preParsing', async function (schema, source, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.ok('preParsing called')
  })

  // preValidation is not triggered a second time
  app.graphql.addHook('preValidation', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preValidation called')
  })

  app.graphql.addHook('preExecution', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preExecution called')
  })

  // Execution events:
  //  - once for user service query
  //  - once for post service query
  //  - once for reference type topPosts on User
  //  - once for reference type author on Post
  app.graphql.addHook('preGatewayExecution', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    t.ok('preGatewayExecution called')
  })

  app.graphql.addHook('onResolution', async function (execution, context) {
    await immediate()
    t.type(execution, 'object')
    t.type(context, 'object')
    t.ok('onResolution called')
  })

  {
    const res = await app.inject({
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
  }

  {
    const res = await app.inject({
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
  }
})

// --------------------
// preParsing
// --------------------
test('gateway - preParsing hooks should handle errors', async t => {
  t.plan(4)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    throw new Error('a preParsing error occured')
  })

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (schema, operation, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preParsing error occured'
      }
    ]
  })
})

test('gateway - preParsing hooks should be able to put values onto the context', async t => {
  t.plan(8)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
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

// --------------
// preValidation
// --------------
test('gateway - preValidation hooks should handle errors', async t => {
  t.plan(4)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    throw new Error('a preValidation error occured')
  })

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preValidation error occured'
      }
    ]
  })
})

test('gateway - preValidation hooks should be able to put values onto the context', async t => {
  t.plan(8)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
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

// -------------
// preExecution
// -------------
test('gateway - preExecution hooks should handle errors', async t => {
  t.plan(4)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    throw new Error('a preExecution error occured')
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preExecution error occured'
      }
    ]
  })
})

test('gateway - preExecution hooks should be able to put values onto the context', async t => {
  t.plan(8)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
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

test('gateway - preExecution hooks should be able to modify the request document', async t => {
  t.plan(5)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preExecution called')
    const documentClone = JSON.parse(JSON.stringify(document))
    documentClone.definitions[0].selectionSet.selections = [documentClone.definitions[0].selectionSet.selections[0]]
    return {
      document: documentClone
    }
  })

  const res = await app.inject({
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
      }
    }
  })
})

test('gateway - preExecution hooks should be able to add to the errors array', async t => {
  t.plan(9)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preExecution called for foo error')
    return {
      errors: [new Error('foo')]
    }
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preExecution called for foo error')
    return {
      errors: [new Error('bar')]
    }
  })

  const res = await app.inject({
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
    },
    errors: [
      {
        message: 'foo'
      },
      {
        message: 'bar'
      }
    ]
  })
})

// -------------------
// preGatewayExecution
// -------------------
test('gateway - preGatewayExecution hooks should handle errors', async t => {
  t.plan(10)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    throw new Error('a preGatewayExecution error occured')
  })

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  // This should still be called in the gateway
  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(context, 'object')
    t.ok('onResolution called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: null,
      topPosts: null
    },
    errors: [
      {
        message: 'a preGatewayExecution error occured',
        locations: [{ line: 3, column: 5 }],
        path: ['me']
      },
      {
        message: 'a preGatewayExecution error occured',
        locations: [{ line: 13, column: 5 }],
        path: ['topPosts']
      }
    ]
  })
})

test('gateway - preGatewayExecution hooks should be able to put values onto the context', async t => {
  t.plan(29)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    context[document.definitions[0].name.value] = 'bar'
  })

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    t.equal(context[document.definitions[0].name.value], 'bar')
  })

  const res = await app.inject({
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

test('gateway - preGatewayExecution hooks should be able to add to the errors array', async t => {
  t.plan(33)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    t.ok('preGatewayExecution called for foo error')
    return {
      errors: [new Error(`foo - ${document.definitions[0].name.value}`)]
    }
  })

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    t.ok('preGatewayExecution called for foo error')
    return {
      errors: [new Error(`bar - ${document.definitions[0].name.value}`)]
    }
  })

  const res = await app.inject({
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
    },
    errors: [
      {
        message: 'foo - Query_me'
      },
      {
        message: 'bar - Query_me'
      },
      {
        message: 'foo - Query_topPosts'
      },
      {
        message: 'bar - Query_topPosts'
      },
      {
        message: 'foo - EntitiesQuery'
      },
      {
        message: 'bar - EntitiesQuery'
      },
      {
        message: 'foo - EntitiesQuery'
      },
      {
        message: 'bar - EntitiesQuery'
      }
    ]
  })
})

test('gateway - preGatewayExecution hooks should be able to modify the request document', async t => {
  t.plan(17)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    t.ok('preGatewayExecution called')
    if (document.definitions[0].name.value === 'EntitiesQuery') {
      if (document.definitions[0].selectionSet.selections[0].selectionSet.selections[1].selectionSet.selections[0].arguments[0]) {
        const documentClone = JSON.parse(JSON.stringify(document))
        documentClone.definitions[0].selectionSet.selections[0].selectionSet.selections[1].selectionSet.selections[0].arguments[0].value.value = 1
        return {
          document: documentClone
        }
      }
    }
  })

  const res = await app.inject({
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

test('gateway - preGatewayExecution hooks should contain service metadata', async (t) => {
  t.plan(21)
  const app = await createTestGatewayServer(t)

  // Execution events:
  //  - user service: once for user service query
  //  - post service: once for post service query
  //  - post service: once for reference type topPosts on User
  //  - user service: once for reference type author on Post
  app.graphql.addHook('preGatewayExecution', async function (schema, document, context, service) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.type(document, 'object')
    t.type(context, 'object')
    if (typeof service === 'object' && service.name === 'user') {
      t.equal(service.name, 'user')
    } else if (typeof service === 'object' && service.name === 'post') {
      t.equal(service.name, 'post')
    } else {
      t.fail('service metadata should be correctly populated')
      return
    }
    t.ok('preGatewayExecution called')
  })

  const res = await app.inject({
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

// -------------
// onResolution
// -------------
test('gateway - onResolution hooks should handle errors', async t => {
  t.plan(3)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(context, 'object')
    throw new Error('a onResolution error occured')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a onResolution error occured'
      }
    ]
  })
})

test('gateway - onResolution hooks should be able to put values onto the context', async t => {
  t.plan(6)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
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
