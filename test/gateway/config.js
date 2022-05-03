'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

test('"schema" option not allowed in gateway mode', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  app.register(GQL, {
    schema,
    gateway: {
      services: []
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: Adding "schema", "resolvers" or "loaders" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"resolvers" option not allowed in gateway mode', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    resolvers: {},
    gateway: {
      services: []
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: Adding "schema", "resolvers" or "loaders" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"loaders" option not allowed in gateway mode', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    loaders: {},
    gateway: {
      services: []
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: Adding "schema", "resolvers" or "loaders" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('Each "gateway" option "services" must be an object', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        'foo'
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must be objects')
  }
})

test('Each "gateway" option "services" must have a "name"', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        {}
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must have a "name" String property')
  }
})

test('Each "gateway" option "services" must have a "name" that is a String', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        { name: 42 }
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must have a "name" String property')
  }
})

test('Each "gateway" option "services" must have a "name" that is unique', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        { name: 'foo', url: 'https://foo' },
        { name: 'foo' }
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must have a unique "name": "foo" is already used')
  }
})

test('Each "gateway" option "services" must have an "url"', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        { name: 'foo' }
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must have an "url" String, or a non-empty Array of String, property')
  }
})

test('Each "gateway" option "services" must have an "url" that is a String or an Array', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        { name: 'foo', url: new URL('https://foo') }
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must have an "url" String, or a non-empty Array of String, property')
  }
})

test('Each "gateway" option "services" must have an "url" that, if it is an Array, should not be empty', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        { name: 'foo', url: [] }
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must have an "url" String, or a non-empty Array of String, property')
  }
})

test('Each "gateway" option "services" must have an "url" that, if it is a non-empty Array, should be filled with Strings only', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    gateway: {
      services: [
        { name: 'foo', url: [new URL('https://foo')] }
      ]
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.equal(err.message, 'Invalid options: gateway: all "services" must have an "url" String, or a non-empty Array of String, property')
  }
})
