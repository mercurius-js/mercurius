'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('"schema" option not allowed in gateway moode', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  app.register(GQL, {
    schema,
    gateway: [{
      name: 'service-1',
      url: 'service.url'
    }]
  })

  try {
    await app.ready()
  } catch (err) {
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"resolvers" option not allowed in gateway moode', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    resolvers: {},
    gateway: [{
      name: 'service-1',
      url: 'service.url'
    }]
  })

  try {
    await app.ready()
  } catch (err) {
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"loaders" option not allowed in gateway moode', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    loaders: {},
    gateway: [{
      name: 'service-1',
      url: 'service.url'
    }]
  })

  try {
    await app.ready()
  } catch (err) {
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"subscription" option not allowed in gateway moode', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    subscription: true,
    gateway: [{
      name: 'service-1',
      url: 'service.url'
    }]
  })

  try {
    await app.ready()
  } catch (err) {
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('It builds the gateway schema correctly', async (t) => {
  const service1 = Fastify()
  service1.register(GQL, {
    schema: `
      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `,
    federationMetadata: true
  })
  await service1.listen(3001)

  const service2 = Fastify()
  service2.register(GQL, {
    schema: `
      type Post @key(fields: "id") {
        id: ID!
        title: String
        content: String
        author: User
      }

      extend type User {
        posts: [Post]
      }
    `,
    federationMetadata: true
  })
  await service2.listen(3002)

  const gateway = Fastify()
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user', url: 'http://localhost:3001/graphql'
      }, {
        name: 'post', url: 'http://localhost:3002/graphql'
      }]
    }
  })

  await gateway.listen(3000)

  const query = '{ me { id } }'
  const res = await gateway.inject({
    method: 'GET',
    url: `/graphql?query=${query}`
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: null
    }
  })
})
