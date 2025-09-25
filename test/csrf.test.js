'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const GQL = require('..')
const { CSRF_ERROR_MESSAGE } = require('../lib/csrf')

// Helper to create a minimal schema and resolvers for testing
const createTestSchema = () => ({
  schema: `
    type Query {
      hello: String
    }
    type Mutation {
      setMessage(message: String): String
    }
  `,
  resolvers: {
    Query: {
      hello: () => 'Hello World'
    },
    Mutation: {
      setMessage: (_, { message }) => message
    }
  }
})

test('CSRF disabled - simple GET request should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: false
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}'
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - simple GET request should be blocked', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}'
  })

  t.assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
  t.assert.equal(body.data, null)
})

test('CSRF enabled - POST with application/json should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ hello }' })
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - POST with application/graphql should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/graphql' },
    body: '{ hello }'
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - GET with required header should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}',
    headers: { 'mercurius-require-preflight': 'true' }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - GET with x-mercurius-operation-name header should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}',
    headers: { 'x-mercurius-operation-name': 'test' }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - headers should be case insensitive', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}',
    headers: { 'X-Mercurius-Operation-Name': 'test' }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - content type with charset should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ query: '{ hello }' })
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - POST with text/plain should be blocked', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'text/plain' },
    body: '{ hello }'
  })

  t.assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF enabled - GET with simple content type should be blocked', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  })

  t.assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF custom config - custom header should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['application/json'],
      requiredHeaders: ['authorization', 'x-custom-header']
    }
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}',
    headers: { authorization: 'Bearer token' }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF custom config - request without valid content type or header should be blocked', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['application/json'],
      requiredHeaders: ['authorization']
    }
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}'
  })

  t.assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF enabled - POST request with variables should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation($msg: String) { setMessage(message: $msg) }',
      variables: { msg: 'test message' }
    })
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { setMessage: 'test message' }
  })
})

test('CSRF enabled - mutation over GET should be blocked by method validation', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query=mutation{setMessage(message:"test")}',
    headers: { 'mercurius-require-preflight': 'true' }
  })

  // This should return 405 (method not allowed) rather than 400 (CSRF error)
  t.assert.equal(res.statusCode, 405)
})

test('CSRF enabled - custom path should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    path: '/api/graphql',
    csrfPrevention: true
  })

  // CSRF protection should work with custom path - block simple request
  const res1 = await app.inject({
    method: 'GET',
    url: '/api/graphql?query={hello}'
  })

  t.assert.equal(res1.statusCode, 400)

  // Should work with valid header
  const res2 = await app.inject({
    method: 'GET',
    url: '/api/graphql?query={hello}',
    headers: { 'mercurius-require-preflight': 'true' }
  })

  t.assert.equal(res2.statusCode, 200)
})

test('CSRF enabled - multiple allowed content types', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['application/json', 'application/graphql', 'application/vnd.api+json']
    }
  })

  // application/json should work
  const res1 = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ hello }' })
  })

  t.assert.equal(res1.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res1.body), {
    data: { hello: 'Hello World' }
  })

  // application/graphql should work
  const res2 = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/graphql' },
    body: '{ hello }'
  })

  t.assert.equal(res2.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res2.body), {
    data: { hello: 'Hello World' }
  })

  // text/plain should be blocked since it's not in allowed types
  const res3 = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}'
  })

  t.assert.equal(res3.statusCode, 400)
  const body = JSON.parse(res3.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF enabled - multipart form data with required header should work', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['application/json', 'multipart/form-data'],
      requiredHeaders: ['x-custom-header']
    }
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}',
    headers: {
      'content-type': 'multipart/form-data',
      'x-custom-header': 'value'
    }
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF enabled - multipart form data without required header should be blocked', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['application/json', 'multipart/form-data'],
      requiredHeaders: ['x-custom-header']
    }
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={hello}',
    headers: { 'content-type': 'multipart/form-data' }
  })

  t.assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF enabled - batch queries should work with proper content type', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true,
    allowBatchedQueries: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      { query: '{ hello }' },
      { query: '{ hello }' }
    ])
  })

  t.assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.assert.equal(Array.isArray(body), true)
  t.assert.equal(body.length, 2)
  t.assert.deepEqual(body[0], { data: { hello: 'Hello World' } })
  t.assert.deepEqual(body[1], { data: { hello: 'Hello World' } })
})

test('CSRF enabled - invalid JSON should be handled properly', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: 'invalid json'
  })

  t.assert.equal(res.statusCode, 400)
  // Should be a JSON parse error, not CSRF error
  const body = JSON.parse(res.body)
  t.assert.notEqual(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF config - allowedContentTypes without multipart/form-data', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  // Test configuration that doesn't include multipart/form-data
  // This should cover the else branch in the map function (line 73)
  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['application/json', 'application/graphql', 'text/plain']
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ hello }' })
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF config - allowedContentTypes with lowercase conversion', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  // Test configuration with content types that need lowercase conversion
  // This should cover the else branch in the map function (line 73)
  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['APPLICATION/JSON', 'APPLICATION/GRAPHQL']
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' }, // lowercase content-type header
    body: JSON.stringify({ query: '{ hello }' })
  })

  t.assert.equal(res.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF - multipart without required header edge case', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['multipart/form-data'],
      requiredHeaders: ['x-required-header']
    }
  })

  // Test multipart content type without required header - should throw CSRF error
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'multipart/form-data' },
    body: 'some form data'
  })

  t.assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF config - default allowedContentTypes when not specified', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  // Test configuration that only specifies requiredHeaders, not allowedContentTypes
  // This should use the default allowedContentTypes (lines 81-82)
  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      requiredHeaders: ['authorization']
    }
  })

  // Should work with default content type
  const res1 = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ hello }' })
  })

  t.assert.equal(res1.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res1.body), {
    data: { hello: 'Hello World' }
  })

  // Should also work with other default content type
  const res2 = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/graphql' },
    body: '{ hello }'
  })

  t.assert.equal(res2.statusCode, 200)
  t.assert.deepEqual(JSON.parse(res2.body), {
    data: { hello: 'Hello World' }
  })
})

test('CSRF - multipart config with explicit multipart flag', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  app.register(GQL, {
    schema,
    resolvers,
    csrfPrevention: {
      allowedContentTypes: ['application/json', 'multipart/form-data'],
      requiredHeaders: ['x-required-header']
    }
  })

  // Test multipart content type without required header - should hit lines 97-98
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'multipart/form-data' },
    body: 'form data'
  })

  t.assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.assert.equal(body.errors[0].message, CSRF_ERROR_MESSAGE)
})

test('CSRF config - invalid requiredHeaders type should throw error', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  // Test configuration with invalid requiredHeaders (not an array) - should hit lines 63-64
  await t.assert.rejects(async () => {
    await app.register(GQL, {
      schema,
      resolvers,
      csrfPrevention: {
        requiredHeaders: 'not-an-array'
      }
    })
    await app.ready()
  }, {
    message: 'csrfPrevention.requiredHeaders must be an array'
  })
})

test('CSRF config - invalid allowedContentTypes type should throw error', async (t) => {
  const app = Fastify()
  const { schema, resolvers } = createTestSchema()

  // Test configuration with invalid allowedContentTypes (not an array) - should hit lines 72-73
  await t.assert.rejects(async () => {
    await app.register(GQL, {
      schema,
      resolvers,
      csrfPrevention: {
        allowedContentTypes: 'not-an-array'
      }
    })
    await app.ready()
  }, {
    message: 'csrfPrevention.allowedContentTypes must be an array'
  })
})

test('CSRF - multipart content type without header triggers specific error path', async (t) => {
  const { normalizeCSRFConfig, checkCSRFPrevention } = require('../lib/csrf')
  const { MER_ERR_GQL_CSRF_PREVENTION } = require('../lib/errors')

  // Test the multipart-specific error path directly (lines 97-98)
  const config = normalizeCSRFConfig({
    allowedContentTypes: ['multipart/form-data'],
    requiredHeaders: ['x-csrf-token']
  })

  const request = {
    headers: {
      'content-type': 'multipart/form-data'
      // Missing the required x-csrf-token header
    }
  }

  // This should hit lines 97-98 specifically
  try {
    checkCSRFPrevention(request, config)
    t.fail('Should have thrown CSRF error')
  } catch (err) {
    t.assert.equal(err.constructor, MER_ERR_GQL_CSRF_PREVENTION)
    t.assert.equal(err.message, CSRF_ERROR_MESSAGE)
  }
})
