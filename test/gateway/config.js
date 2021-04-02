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
