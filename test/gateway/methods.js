'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createService (t, port, schema, resolvers = {}) {
  const service = Fastify()
  t.tearDown(() => service.close())
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
  })
  await service.listen(port)
}

test('calling defineLoaders throws an error in gateway mode', async (t) => {
  await createService(t, 3001, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  const app = Fastify()
  t.tearDown(() => app.close())

  app.register(GQL, {
    gateway: {
      services: [{
        name: 'service-1',
        url: 'http://localhost:3001/graphql'
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
  await createService(t, 3002, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  const app = Fastify()
  t.tearDown(() => app.close())

  app.register(GQL, {
    gateway: {
      services: [{
        name: 'service-1',
        url: 'http://localhost:3002/graphql'
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

test('calling replaceSchema throws an error in gateway mode', async (t) => {
  await createService(t, 3003, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  const app = Fastify()
  t.tearDown(() => app.close())

  app.register(GQL, {
    gateway: {
      services: [{
        name: 'service-1',
        url: 'http://localhost:3003/graphql'
      }]
    }
  })

  await app.ready()

  try {
    app.graphql.replaceSchema(`
      type Query {
        field: String!
      }
    `)
  } catch (err) {
    t.is(err.message, 'Calling replaceSchema method is not allowed when plugin is running in gateway mode is not allowed')
  }
})

test('calling extendSchema throws an error in gateway mode', async (t) => {
  await createService(t, 3004, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  const app = Fastify()
  t.tearDown(() => app.close())

  app.register(GQL, {
    gateway: {
      services: [{
        name: 'service-1',
        url: 'http://localhost:3004/graphql'
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
  }
})
