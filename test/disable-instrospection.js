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
  await t.rejects(app.graphql(query), { errors: [{ message: 'GraphQL introspection has been disabled, but the requested query contained the field "__schema".' }] })
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
  await t.rejects(app.graphql(query), { errors: [{ message: 'GraphQL introspection has been disabled, but the requested query contained the field "__type".' }] })
})
