'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function createTestService (t, schema, resolvers = {}) {
  const service = Fastify()
  t.tearDown(() => {
    service.close()
  })
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
  })
  await service.listen(0)

  return service.server.address().port
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
  const userServicePort = await createTestService(t, userServiceSchema, userServiceResolvers)

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
  const postServicePort = await createTestService(t, postServiceSchema, postServiceResolvers)

  const gateway = Fastify()
  t.tearDown(() => {
    gateway.close()
  })
  gateway.register(GQL, {
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
  await gateway.ready()
  return gateway
}

// -----
// hooks
// -----
test('gateway - hooks', async (t) => {
  t.plan(9)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preParsing', async function (request) {
    await sleep(1)
    t.is(request.source, query)
    t.ok('preParsing called')
  })

  app.graphql.addHook('preValidation', async function (request, reply) {
    await sleep(1)
    t.ok('preValidation called')
  })

  // Execution events:
  //  - once for user service query
  //  - once for post service query
  //  - once for reference type topPosts on User
  //  - once for reference type author on Post
  app.graphql.addHook('preExecution', async function (schema, document, context) {
    await sleep(1)
    t.ok('preExecution called')
  })

  app.graphql.addHook('onResolution', async function () {
    await sleep(1)
    t.ok('onResolution called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
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
    t.strictEqual(e.message, 'unsupportedHook hook not supported!')
  }
})

test('gateway - hooks validation should handle invalid hook name types', async (t) => {
  t.plan(2)
  const app = await createTestGatewayServer(t)

  try {
    app.graphql.addHook(1, async () => {})
  } catch (e) {
    t.strictEqual(e.code, 'MER_ERR_HOOK_INVALID_TYPE')
    t.strictEqual(e.message, 'The hook name must be a string')
  }
})

test('gateway - hooks validation should handle invalid hook handlers', async (t) => {
  t.plan(2)
  const app = await createTestGatewayServer(t)

  try {
    app.graphql.addHook('preParsing', 'not a function')
  } catch (e) {
    t.strictEqual(e.code, 'MER_ERR_HOOK_INVALID_HANDLER')
    t.strictEqual(e.message, 'The hook callback must be a function')
  }
})

// --------------------
// preParsing
// --------------------
test('gateway - preParsing hooks should handle errors', async t => {
  t.plan(1)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preParsing', async (request) => {
    throw new Error('a preParsing error occured')
  })

  app.graphql.addHook('preParsing', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preValidation', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (schema, operation, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (request) => {
    t.fail('this should not be called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preParsing error occured'
      }
    ]
  })
})

// --------------
// preValidation
// --------------
test('gateway - preValidation hooks should handle errors', async t => {
  t.plan(1)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preValidation', async (request) => {
    throw new Error('a preValidation error occured')
  })

  app.graphql.addHook('preValidation', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (request) => {
    await sleep(1)
    t.fail('this should not be called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preValidation error occured'
      }
    ]
  })
})

// -------------
// preExecution
// -------------
test('gateway - preExecution hooks should handle errors', async t => {
  t.plan(2)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preExecution', async (request) => {
    throw new Error('a preExecution error occured')
  })

  app.graphql.addHook('preExecution', async (request) => {
    t.fail('this should not be called')
  })

  // This should still be called in the gateway
  app.graphql.addHook('onResolution', async (request) => {
    t.ok('onResolution called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: null,
      topPosts: null
    },
    errors: [
      {
        message: 'a preExecution error occured',
        locations: [{ line: 3, column: 5 }],
        path: ['me']
      },
      {
        message: 'a preExecution error occured',
        locations: [{ line: 13, column: 5 }],
        path: ['topPosts']
      }
    ]
  })
})

test('preExecution hooks should be able to add to the errors array', async t => {
  t.plan(9)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.ok('preExecution called for foo error')
    return {
      errors: [new Error(`foo - ${document.definitions[0].name.value}`)]
    }
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.ok('preExecution called for foo error')
    return {
      errors: [new Error(`bar - ${document.definitions[0].name.value}`)]
    }
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
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

test('preExecution hooks should be able to modify the request document', async t => {
  t.plan(5)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.ok('preExecution called')
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

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
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

// -------------
// onResolution
// -------------
test('gateway - onResolution hooks should handle errors', async t => {
  t.plan(1)
  const app = await createTestGatewayServer(t)

  app.graphql.addHook('onResolution', async (request) => {
    throw new Error('a onResolution error occured')
  })

  app.graphql.addHook('onResolution', async (request) => {
    t.fail('this should not be called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a onResolution error occured'
      }
    ]
  })
})