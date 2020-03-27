'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

async function createService (t, port, schema) {
  const service = Fastify()
  t.tearDown(() => service.close())
  service.register(GQL, {
    schema,
    federationMetadata: true
  })
  await service.listen(port)
}

test('"schema" option not allowed in gateway moode', async (t) => {
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
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"resolvers" option not allowed in gateway moode', async (t) => {
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
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"loaders" option not allowed in gateway moode', async (t) => {
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
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

test('"subscription" option not allowed in gateway moode', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    subscription: true,
    gateway: {
      services: []
    }
  })

  try {
    await app.ready()
  } catch (err) {
    t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
  }
})

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
    app.graphql.extendSchema(`
      extend type Query {
        field: String!
      }
    `)
  } catch (err) {
    t.is(err.message, 'Calling extendSchema method is not allowed when plugin is running in gateway mode is not allowed')
  }
})

test('It builds the gateway schema correctly', async (t) => {
  await createService(t, 3001, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `)

  await createService(t, 3002, `
    type Post @key(fields: "id") {
      id: ID!
      title: String
      content: String
      author: User
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      posts: [Post]
    }
  `)

  const gateway = Fastify()
  t.tearDown(() => gateway.close())
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: 'http://localhost:3001/graphql'
      }, {
        name: 'post',
        url: 'http://localhost:3002/graphql'
      }]
    }
  })

  await gateway.listen(3000)

  // const query = '{ me { id name posts { id title content author { id } } } }'
  const query = '{ me { id name } }'
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

// const { buildSchema, printSchema } = require('graphql')

// test('foo', t => {
//   const schema = `
//     type User {
//       id: ID!
//       name: String
//     }

//     type Post {
//       id: ID!
//       title: String
//       author: User
//     }

//     extend type User {
//       posts: [Post]
//     }
//   `
//   const result = printSchema(buildSchema(schema))

//   console.log(result)
//   t.equal(result, schema)
// })
