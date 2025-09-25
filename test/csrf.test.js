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
