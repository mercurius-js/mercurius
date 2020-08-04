'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createService (t, schema, resolvers = {}) {
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

test('calling defineLoaders throws an error in gateway mode', async (t) => {
  const port = await createService(t, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  const app = Fastify()
  t.tearDown(() => {
    app.close()
  })

  app.register(GQL, {
    gateway: {
      services: [{
        name: 'service-1',
        url: `http://localhost:${port}/graphql`
      }]
    }
  })

  await app.ready()

  try {
    app.graphql.defineLoaders({
      Query: {
        field () {}
      }
    })
  } catch (err) {
    t.is(err.message, 'Calling defineLoaders method is not allowed when plugin is running in gateway mode is not allowed')
  }
})

test('calling defineResolvers throws an error in gateway mode', async (t) => {
  const port = await createService(t, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  const app = Fastify()
  t.tearDown(() => {
    app.close()
  })

  app.register(GQL, {
    gateway: {
      services: [{
        name: 'service-1',
        url: `http://localhost:${port}/graphql`
      }]
    }
  })

  await app.ready()

  try {
    app.graphql.defineResolvers({
      Query: {
        field () {}
      }
    })
  } catch (err) {
    t.is(err.message, 'Calling defineResolvers method is not allowed when plugin is running in gateway mode is not allowed')
  }
})

test('calling extendSchema throws an error in gateway mode', async (t) => {
  const port = await createService(t, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  const app = Fastify()
  t.tearDown(() => {
    app.close()
  })

  app.register(GQL, {
    gateway: {
      services: [{
        name: 'service-1',
        url: `http://localhost:${port}/graphql`
      }]
    }
  })

  await app.ready()

  try {
    app.graphql.extendSchema(`
      extend type Query {
        field: String!
      }
    `)
  } catch (err) {
    t.is(err.message, 'Calling extendSchema method is not allowed when plugin is running in gateway mode is not allowed')
    t.end()
  }
})
