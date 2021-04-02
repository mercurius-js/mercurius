'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')
const { GraphQLError } = require('graphql')

const {
  GraphQLScalarType,
  GraphQLEnumType
} = require('graphql')
const { makeExecutableSchema } = require('@graphql-tools/schema')

test('basic GQL', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      add: 4
    }
  })
})

test('support context in resolver', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      ctx: Int
    }
  `

  const resolvers = {
    ctx: async (_, ctx) => {
      t.equal(ctx.app, app)
      return ctx.num
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ ctx }'
  const res = await app.graphql(query, { num: 42 })

  t.same(res, {
    data: {
      ctx: 42
    }
  })
})

test('variables', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'
  const res = await app.graphql(query, null, {
    x: 2,
    y: 2
  })

  t.same(res, {
    data: {
      add: 4
    }
  })
})

test('operationName', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = `
    query MyQuery ($x: Int!, $y: Int!) {
      add(x: $x, y: $y)
    }

    query Double ($x: Int!) {
      add(x: $x, y: $x)
    }
  `
  const res = await app.graphql(query, null, {
    x: 2,
    y: 1 // useless
  }, 'Double')

  t.same(res, {
    data: {
      add: 4
    }
  })
})

test('replaceSchema with makeSchemaExecutable', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema: makeExecutableSchema({
      typeDefs: `
      type Query {
        add(x: Int, y: Int): Int
      }
    `,
      resolvers: {
        Query: {
          add: async (_, { x, y }) => x + y
        }
      }
    })
  })

  app.register(async function (app) {
    app.graphql.replaceSchema(
      makeExecutableSchema({
        typeDefs: `
        type Query {
          add(x: Int, y: Int, z: Int): Int
        }
      `,
        resolvers: {
          Query: {
            add: async (_, { x, y, z }) => x + y + z
          }
        }
      })
    )
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2, z: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      add: 6
    }
  })
})

test('replaceSchema (clearing cache)', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema: makeExecutableSchema({
      typeDefs: `
      type Query {
        add(x: Int, y: Int): Int
        subtract(x: Int, y: Int): Int
      }
    `,
      resolvers: {
        Query: {
          add: async (_, { x, y }) => x + y,
          subtract: async (_, { x, y }) => x - y
        }
      }
    })
  })

  // needed so that graphql is defined
  await app.ready()

  let query

  query = '{ subtract(x: 4, y: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      subtract: 2
    }
  })

  app.graphql.replaceSchema(
    makeExecutableSchema({
      typeDefs: `
      type Query {
        add(x: Int, y: Int): Int
      }
    `,
      resolvers: {
        Query: {
          add: async (_, { x, y }) => x + y
        }
      }
    })
  )

  query = '{ subtract(x: 4, y: 2) }'
  try {
    await app.graphql(query)
  } catch (err) {
    t.equal(err.errors[0].message, 'Cannot query field "subtract" on type "Query".')
  }
})

test('replaceSchema (without cache)', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    cache: false,
    schema: makeExecutableSchema({
      typeDefs: `
      type Query {
        add(x: Int, y: Int): Int
        subtract(x: Int, y: Int): Int
      }
    `,
      resolvers: {
        Query: {
          add: async (_, { x, y }) => x + y,
          subtract: async (_, { x, y }) => x - y
        }
      }
    })
  })

  // needed so that graphql is defined
  await app.ready()

  let query

  query = '{ subtract(x: 4, y: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      subtract: 2
    }
  })

  app.graphql.replaceSchema(
    makeExecutableSchema({
      typeDefs: `
      type Query {
        add(x: Int, y: Int): Int
      }
    `,
      resolvers: {
        Query: {
          add: async (_, { x, y }) => x + y
        }
      }
    })
  )

  query = '{ subtract(x: 4, y: 2) }'
  try {
    await app.graphql(query)
  } catch (err) {
    t.equal(err.errors[0].message, 'Cannot query field "subtract" on type "Query".')
  }
})

test('replaceSchema with makeSchemaExecutable (schema should be provided)', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema: makeExecutableSchema({
      typeDefs: `
      type Query {
        add(x: Int, y: Int): Int
      }
    `,
      resolvers: {
        Query: {
          add: async (_, { x, y }) => x + y
        }
      }
    })
  })

  app.register(async function (app) {
    app.graphql.replaceSchema()
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Invalid options: Must provide valid Document AST')
  }
})

test('extendSchema and defineResolvers for query', async (t) => {
  const app = Fastify()
  const schema1 = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  const schema2 = `
    extend type Query {
      subtract(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, { schema: schema1 })

  app.register(async function (app) {
    app.graphql.extendSchema(schema2)
    app.graphql.defineResolvers(resolvers)
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      add: 4
    }
  })
})

test('extendSchema changes reflected in schema access', async (t) => {
  const app = Fastify()
  const schema1 = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `
  const schema2 = `
    extend type Query {
      subtract(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, { schema: schema1 })

  let beforeSchema
  app.register(async function (app) {
    beforeSchema = app.graphql.schema

    app.graphql.extendSchema(schema2)
    app.graphql.defineResolvers(resolvers)
  })

  // needed so that graphql is defined
  await app.ready()

  t.not(beforeSchema, app.graphql.schema)
  t.end()
})

test('extendSchema and defineResolvers with mutation definition', async (t) => {
  const app = Fastify()
  const schema = `
    extend type Query {
      add(x: Int, y: Int): Int
    }
    extend type Mutation {
      sub(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y,
    sub: async ({ x, y }) => x - y
  }

  app.register(GQL, { defineMutation: true })

  app.register(async function (app) {
    app.graphql.extendSchema(schema)
    app.graphql.defineResolvers(resolvers)
  })

  // needed so that graphql is defined
  await app.ready()

  const mutation = 'mutation { sub(x: 2, y: 2) }'
  const res = await app.graphql(mutation)

  t.same(res, {
    data: {
      sub: 0
    }
  })
})

test('extendSchema and defineResolvers throws without mutation definition', async (t) => {
  const app = Fastify()

  const schema1 = `
    type Query {
      multiply(x: Int, y: Int): Int
    }
  `

  const schema2 = `
    extend type Query {
      add(x: Int, y: Int): Int
    }

    type Mutation {
      sub(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y,
    sub: async ({ x, y }) => x - y
  }

  app.register(GQL, { schema: schema1 })

  app.register(async function (app) {
    app.graphql.extendSchema(schema2)
    app.graphql.defineResolvers(resolvers)
  })

  // needed so that graphql is defined
  await app.ready()

  const mutation = 'mutation { sub(x: 2, y: 2) }'

  try {
    await app.graphql(mutation)
  } catch (e) {
    t.equal(e instanceof GraphQLError, true)
    t.end()
  }
})

test('basic GQL no cache', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    cache: false
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      add: 4
    }
  })
})

test('complex types', async (t) => {
  const app = Fastify()
  const schema = `
    type Person {
      name: String
      friends: [Person]
    }

    type Query {
      people: [Person]
    }
  `

  const resolvers = {
    Person: {
      friends: (root) => {
        if (root.name === 'matteo') {
          return [Promise.resolve({ name: 'marco' })]
        }
        if (root.name === 'marco') {
          return [Promise.resolve({ name: 'matteo' })]
        }
        return []
      }
    },
    Query: {
      people: (root) => {
        return [Promise.resolve({
          name: 'matteo'
        }), Promise.resolve({
          name: 'marco'
        })]
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ people { name, friends { name } } }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      people: [{
        name: 'matteo',
        friends: [{
          name: 'marco'
        }]
      }, {
        name: 'marco',
        friends: [{
          name: 'matteo'
        }]
      }]
    }
  })
})

test('makeSchemaExecutable', async (t) => {
  const app = Fastify()
  const typeDefs = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: async (_, { x, y }) => x + y
    }
  }

  const schema = makeExecutableSchema({ typeDefs, resolvers })
  app.register(GQL, {
    schema
  })

  // needed so that graphql is defined
  await app.ready()
  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)
  t.same(res, {
    data: {
      add: 4
    }
  })
})

test('scalar should be supported', async (t) => {
  t.plan(2)

  const app = Fastify()
  const schema = `
    scalar Date

    type Query {
      add(x: Int, y: Int): Date
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y,
    Date: new GraphQLScalarType({
      name: 'Date',
      description: 'Date custom scalar type',
      parseValue (value) {
        return value
      },
      serialize (value) {
        t.pass(value, 4)
        return value
      },
      parseLiteral (ast) {
        // not called on this test
        return null
      }
    })
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      add: 4
    }
  })
})

test('enum should be supported', async (t) => {
  const app = Fastify()
  const schema = `
    enum MyEnum {
      YES
      NO
    }

    type Query {
      add(x: Int, y: Int): MyEnum
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y,
    MyEnum: new GraphQLEnumType({
      name: 'MyEnum',
      description: 'MyEnum custom scalar type',
      values: {
        YES: { value: 4 },
        NO: { value: 2 }
      }
    })
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  t.same(res, {
    data: {
      add: 'YES'
    }
  })
})

test('interfaces should be supported with isTypeOf', async (t) => {
  const app = Fastify()
  const schema = `
    interface Geometry {
      type: String!
    }

    type Polygon implements Geometry {
      type: String!
      coordinates: String
    }

    type MultiPolygon implements Geometry {
      type: String!
      coordinates: Int
    }

    type Query {
      getGeometryPolygon: Geometry
      getGeometryMultiPolygon: Geometry
    }
  `

  const resolvers = {
    Query: {
      getGeometryPolygon: async () => {
        return {
          type: 'Polygon',
          coordinates: 'test'
        }
      },
      getGeometryMultiPolygon: async () => {
        return {
          type: 'MultiPolygon',
          coordinates: 1
        }
      }
    },
    Polygon: {
      isTypeOf (geometry) {
        return geometry.type === 'Polygon'
      }
    },
    MultiPolygon: {
      isTypeOf (geometry) {
        return geometry.type === 'MultiPolygon'
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const queryPoly = `{
    getGeometryPolygon {
      type
      ... on Polygon {
        coordinates
      }
    }
  }`
  const resPoly = await app.graphql(queryPoly)

  t.same(resPoly, {
    data: {
      getGeometryPolygon: {
        type: 'Polygon',
        coordinates: 'test'
      }
    }
  })

  const queryMultiPoly = `{
    getGeometryMultiPolygon {
      type
      ... on MultiPolygon {
        coordinates
      }
    }
  }`
  const resMultiPoly = await app.graphql(queryMultiPoly)

  t.same(resMultiPoly, {
    data: {
      getGeometryMultiPolygon: {
        type: 'MultiPolygon',
        coordinates: 1
      }
    }
  })
})

test('interfaces should be supported with resolveType', async (t) => {
  const app = Fastify()
  const schema = `
    interface Geometry {
      type: String!
    }

    type Polygon implements Geometry {
      type: String!
      coordinates: String
    }

    type MultiPolygon implements Geometry {
      type: String!
      coordinates: Int
    }

    type Query {
      getGeometryPolygon: Geometry
      getGeometryMultiPolygon: Geometry
    }
  `

  const resolvers = {
    Query: {
      getGeometryPolygon: async () => {
        return {
          type: 'Polygon',
          coordinates: 'test'
        }
      },
      getGeometryMultiPolygon: async () => {
        return {
          type: 'MultiPolygon',
          coordinates: 1
        }
      }
    },
    Geometry: {
      resolveType (geometry) {
        return geometry.type
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const queryPoly = `{
    getGeometryPolygon {
      type
      ... on Polygon {
        coordinates
      }
    }
  }`
  const resPoly = await app.graphql(queryPoly)

  t.same(resPoly, {
    data: {
      getGeometryPolygon: {
        type: 'Polygon',
        coordinates: 'test'
      }
    }
  })

  const queryMultiPoly = `{
    getGeometryMultiPolygon {
      type
      ... on MultiPolygon {
        coordinates
      }
    }
  }`
  const resMultiPoly = await app.graphql(queryMultiPoly)

  t.same(resMultiPoly, {
    data: {
      getGeometryMultiPolygon: {
        type: 'MultiPolygon',
        coordinates: 1
      }
    }
  })
})

test('union should be supported with resolveType', async (t) => {
  const app = Fastify()
  const schema = `
    union Geometry = Polygon | MultiPolygon

    type Polygon {
      type: String!
      coordinates: String
    }

    type MultiPolygon {
      type: String!
      coordinates: Int
    }

    type Query {
      getGeometryPolygon: Geometry
      getGeometryMultiPolygon: Geometry
    }
  `

  const resolvers = {
    Query: {
      getGeometryPolygon: async () => {
        return {
          type: 'Polygon',
          coordinates: 'test'
        }
      },
      getGeometryMultiPolygon: async () => {
        return {
          type: 'MultiPolygon',
          coordinates: 1
        }
      }
    },
    Geometry: {
      resolveType (geometry) {
        return geometry.type
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const queryPoly = `{
    getGeometryPolygon {
      ... on Polygon {
        type
        coordinates
      }
    }
  }`
  const resPoly = await app.graphql(queryPoly)

  t.same(resPoly, {
    data: {
      getGeometryPolygon: {
        type: 'Polygon',
        coordinates: 'test'
      }
    }
  })

  const queryMultiPoly = `{
    getGeometryMultiPolygon {
      ... on MultiPolygon {
        type
        coordinates
      }
    }
  }`
  const resMultiPoly = await app.graphql(queryMultiPoly)

  t.same(resMultiPoly, {
    data: {
      getGeometryMultiPolygon: {
        type: 'MultiPolygon',
        coordinates: 1
      }
    }
  })
})

test('extended Schema is not string', async t => {
  const app = Fastify()

  const schema1 = `
  type Query {
    add(x: Int, y: Int): Int
  }
  `

  const schema2 = 666

  app.register(GQL, { schema: schema1 })
  app.register(async function (app) {
    app.graphql.extendSchema(schema2)
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Invalid options: Must provide valid Document AST')
  }
})

test('extended Schema is undefined', async t => {
  const app = Fastify()
  const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
  `
  app.register(GQL, { schema })
  app.register(async function (app) {
    app.graphql.extendSchema()
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Invalid options: Must provide valid Document AST')
  }
})

test('extended Schema is an object', async t => {
  const app = Fastify()

  const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
  `

  const schemaObject = {
    kind: 'Document',
    definitions: [
      {
        kind: 'ObjectTypeExtension',
        name: { kind: 'Name', value: 'Query' },
        interfaces: [],
        directives: [],
        fields: [{
          kind: 'FieldDefinition',
          name: {
            kind: 'Name',
            value: 'title'
          },
          arguments: [],
          type: {
            kind: 'NamedType',
            name: {
              kind: 'Name',
              value: 'String'
            }
          },
          directives: []
        }],
        loc: { start: 5, end: 61 }
      }
    ]
  }

  app.register(GQL, { schema })
  app.register(async function (app) {
    app.graphql.extendSchema(schemaObject)
  })

  await app.ready()
})

test('Error in schema', async (t) => {
  const schema = `
    interface Event {
      Id: Int!
    }
    type CustomEvent implements Event {
      # Id needs to be specified here
      Name: String!
    }
    type Query {
      listEvent: [Event]
    }
  `

  const resolvers = {
    listEvent: async () => []
  }

  const app = Fastify()

  try {
    app.register(GQL, {
      schema,
      resolvers
    })
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Interface field Event.Id expected but CustomEvent does not provide it.')
    t.equal(error.name, 'GraphQLError')
  }
})

test('Multiple errors in schema', async (t) => {
  const schema = `
    interface Event {
      Id: Int!
    }
    type CustomEvent implements Event {
      # Id needs to be specified here
      Name: String!
    }
    type AnotherEvent implements Event {
      # Id needs to be specified here
      Name: String!
    }
    type Query {
      listEvent: [Event]
    }
  `

  const resolvers = {
    listEvent: async () => []
  }

  const app = Fastify()

  try {
    app.register(GQL, {
      schema,
      resolvers
    })
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Invalid schema: check out the .errors property on the Error')
    t.equal(error.name, 'FastifyError')
    t.equal(error.errors[0].message, 'Interface field Event.Id expected but CustomEvent does not provide it.')
    t.equal(error.errors[0].name, 'GraphQLError')
    t.equal(error.errors[1].message, 'Interface field Event.Id expected but AnotherEvent does not provide it.')
    t.equal(error.errors[1].name, 'GraphQLError')
  }
})

test('defineResolvers should throw if field is not defined in schema', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    Query: {
      add: async ({ x, y }) => x + y,
      sub: async ({ x, y }) => x - y
    }
  }

  app.register(GQL, { schema: schema })

  app.register(async function (app) {
    t.throws(function () {
      app.graphql.defineResolvers(resolvers)
    }, new Error('Cannot find field sub of type Query'))
  })

  // needed so that graphql is defined
  await app.ready()
})

test('calling extendSchema throws an error if federationMetadata is enabled', async (t) => {
  const service = Fastify()
  t.teardown(() => service.close())
  service.register(GQL, {
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
  await service.ready()

  try {
    service.graphql.extendSchema(`
      extend type Query {
        field: String!
      }
    `)
  } catch (err) {
    t.equal(err.message, 'Invalid method: Calling extendSchema method when federationMetadata is enabled is not allowed')
    t.end()
  }
})
