'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('..')
const graphql = require('graphql')

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

test('should disallow instrospection with "__schema" when NoSchemaIntrospectionCustomRule are applied to validationRules', async (t) => {
  const app = Fastify()

  const query = '{ __schema { queryType { name } } }'

  app.register(mercurius, {
    schema,
    resolvers,
    graphiql: true,
    validationRules: [graphql.NoSchemaIntrospectionCustomRule]
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql(query)
  } catch (e) {
    t.equal(e.errors.length > 0, true)
    t.equal(e.errors[0].message, 'GraphQL introspection has been disabled, but the requested query contained the field "__schema".')
  }
})

test('should disallow instrospection with "__type" when NoSchemaIntrospectionCustomRule are applied to validationRules', async (t) => {
  const app = Fastify()

  const query = '{ __type(name: "Query"){ name } }'

  app.register(mercurius, {
    schema,
    resolvers,
    graphiql: true,
    validationRules: [graphql.NoSchemaIntrospectionCustomRule]
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql(query)
  } catch (e) {
    t.equal(e.errors.length > 0, true)
    t.equal(e.errors[0].message, 'GraphQL introspection has been disabled, but the requested query contained the field "__type".')
  }
})
