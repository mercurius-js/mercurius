'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('..')
const { defaultFieldResolver } = require('graphql')
const {
  MapperKind,
  mapSchema,
  getDirectives,
  makeExecutableSchema,
  printSchemaWithDirectives,
  getResolversFromSchema,
  mergeResolvers
} = require('graphql-tools')
const buildFederationSchema = require('../lib/federation')

function upperDirectiveTransformer (schema) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const directives = getDirectives(schema, fieldConfig)
      if (directives.upper) {
        const { resolve = defaultFieldResolver } = fieldConfig
        fieldConfig.resolve = async function (source, args, context, info) {
          const result = await resolve(source, args, context, info)
          if (typeof result === 'string') {
            return result.toUpperCase()
          }
          return result
        }
        return fieldConfig
      }
    }
  })
}

test('custom directives should work', async (t) => {
  const app = Fastify()
  const schema = `
    directive @upper on FIELD_DEFINITION
    
    type Query {
      foo: String @upper
      user: User
    }
    
    type User {
      id: ID!
      name: String @upper
    }
  `

  const resolvers = {
    Query: {
      foo: () => 'bar',
      user: () => ({ id: '1' })
    }
  }

  const loaders = {
    User: {
      name: async (queries) => queries.map(() => 'name')
    }
  }

  app.register(mercurius, {
    schema,
    resolvers,
    loaders,
    schemaTransforms: [upperDirectiveTransformer]
  })

  await app.ready()

  let query = 'query { foo }'
  let res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.deepEqual(JSON.parse(res.body), { data: { foo: 'BAR' } })

  query = 'query { user { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.deepEqual(JSON.parse(res.body), { data: { user: { id: '1', name: 'NAME' } } })
})

test('custom directives should work with executable schema', async (t) => {
  const app = Fastify()
  const schema = `
    directive @upper on FIELD_DEFINITION
    
    type Query {
      foo: String @upper
      user: User
    }
    
    type User {
      id: ID!
      name: String @upper
    }
  `

  const resolvers = {
    Query: {
      foo: () => 'bar',
      user: () => ({ id: '1' })
    }
  }

  const loaders = {
    User: {
      name: async (queries) => queries.map(() => 'name')
    }
  }

  const executableSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers
  })

  app.register(mercurius, {
    schema: executableSchema,
    loaders,
    schemaTransforms: [upperDirectiveTransformer]
  })

  await app.ready()

  let query = 'query { foo }'
  let res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.deepEqual(JSON.parse(res.body), { data: { foo: 'BAR' } })

  query = 'query { user { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.deepEqual(JSON.parse(res.body), { data: { user: { id: '1', name: 'NAME' } } })
})

test('federation support and custom directives', async (t) => {
  const app = Fastify()
  const schema = `
    directive @upper on FIELD_DEFINITION
    
    type Query {
      foo: String @upper
      user: User
    }
    
    type User {
      id: ID!
      name: String @upper
    }
  `

  const resolvers = {
    Query: {
      foo: () => 'bar',
      user: () => ({ id: '1' })
    }
  }

  const loaders = {
    User: {
      name: async (queries) => queries.map(() => 'name')
    }
  }

  app.register(mercurius, {
    schema,
    resolvers,
    loaders,
    federationMetadata: true,
    schemaTransforms: [upperDirectiveTransformer]
  })

  await app.ready()

  let query = '{ _service { sdl } }'
  let res = await app.inject({ method: 'GET', url: `/graphql?query=${query}` })
  t.deepEqual(JSON.parse(res.body), { data: { _service: { sdl: schema } } })

  query = 'query { foo }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.deepEqual(JSON.parse(res.body), { data: { foo: 'BAR' } })

  query = 'query { user { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.deepEqual(JSON.parse(res.body), { data: { user: { id: '1', name: 'NAME' } } })
})

test('federation support using schema from buildFederationSchema and custom directives', async (t) => {
  const app = Fastify()
  const schema = `
    directive @upper on FIELD_DEFINITION
    
    type Query {
      foo: String @upper
    }
  `

  const resolvers = {
    Query: {
      foo: () => 'bar'
    }
  }

  const federationSchema = buildFederationSchema(schema)

  const executableSchema = makeExecutableSchema({
    typeDefs: printSchemaWithDirectives(federationSchema),
    resolvers: mergeResolvers([getResolversFromSchema(federationSchema), resolvers])
  })

  app.register(mercurius, {
    schema: executableSchema,
    schemaTransforms: [upperDirectiveTransformer]
  })

  await app.ready()

  let query = '{ _service { sdl } }'
  let res = await app.inject({ method: 'GET', url: `/graphql?query=${query}` })
  t.deepEqual(JSON.parse(res.body), { data: { _service: { sdl: schema } } })

  query = 'query { foo }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.deepEqual(JSON.parse(res.body), { data: { foo: 'BAR' } })
})
