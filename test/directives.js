'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('..')
const { defaultFieldResolver, GraphQLScalarType, isNonNullType, isScalarType } = require('graphql')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { mergeResolvers } = require('@graphql-tools/merge')
const {
  MapperKind,
  mapSchema,
  getDirectives,
  printSchemaWithDirectives,
  getResolversFromSchema
} = require('@graphql-tools/utils')
const buildFederationSchema = require('../lib/federation')
const { canUseIncrementalExecution } = require('../lib/util')

class ValidationError extends Error {
  constructor (message, extensions) {
    super(message)
    this.extensions = extensions
    this.message = message
  }
}

class LimitedLengthType extends GraphQLScalarType {
  constructor (type, maxLength) {
    super({
      name: `${type.name}WithLengthAtMost${maxLength.toString()}`,
      serialize (value) {
        const newValue = type.serialize(value)
        if (newValue.length > maxLength) {
          throw new ValidationError(`expected length ${newValue.length} to be at most ${maxLength}`, { foo: 'bar' })
        }
        return newValue
      },
      parseValue (value) {
        const newValue = type.parseValue(value)
        if (newValue.length > maxLength) {
          throw new ValidationError(`expected length ${newValue.length} to be at most ${maxLength}`, { foo: 'bar' })
        }
        return newValue
      },
      parseLiteral (ast) {
        const newValue = type.parseLiteral(ast, {})
        if (newValue.length > maxLength) {
          throw new ValidationError(`expected length ${newValue.length} to be at most ${maxLength}`, { foo: 'bar' })
        }
        return newValue
      }
    })
  }
}

function getLimitedLengthType (type, maxLength) {
  const limitedLengthTypes = {}
  const limitedLengthTypesByTypeName = limitedLengthTypes[type.name]
  if (!limitedLengthTypesByTypeName) {
    const newType = new LimitedLengthType(type, maxLength)
    limitedLengthTypes[type.name] = {}
    limitedLengthTypes[type.name][maxLength] = newType
    return newType
  }
  const limitedLengthType = limitedLengthTypesByTypeName[maxLength]
  if (!limitedLengthType) {
    const newType = new LimitedLengthType(type, maxLength)
    limitedLengthTypesByTypeName[maxLength] = newType
    return newType
  }
  return limitedLengthType
}

function wrapType (fieldConfig, directiveArgumentMap) {
  if (isNonNullType(fieldConfig.type) && isScalarType(fieldConfig.type.ofType)) {
    fieldConfig.type = getLimitedLengthType(fieldConfig.type.ofType, directiveArgumentMap.max)
  } else if (isScalarType(fieldConfig.type)) {
    fieldConfig.type = getLimitedLengthType(fieldConfig.type, directiveArgumentMap.max)
  } else {
    throw new Error(`Not a scalar type: ${fieldConfig.type.toString()}`)
  }
}

const lengthDirectiveTypeDefs = 'directive @length(max: Int) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION'
function lengthDirectiveTransformer (schema) {
  return mapSchema(schema, {
    [MapperKind.FIELD]: (fieldConfig) => {
      const directives = getDirectives(schema, fieldConfig)
      for (const directive of directives) {
        if (directive.name === 'length') {
          wrapType(fieldConfig, directive.args)
          return fieldConfig
        }
      }
    }
  })
}

const upperDirectiveTypeDefs = 'directive @upper on FIELD_DEFINITION'
function upperDirectiveTransformer (schema) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const directives = getDirectives(schema, fieldConfig)
      for (const directive of directives) {
        if (directive.name === 'upper') {
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
    }
  })
}

test('custom directives should work', async (t) => {
  const app = Fastify()
  const schema = `
    ${upperDirectiveTypeDefs}
    
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
  t.same(JSON.parse(res.body), { data: { foo: 'BAR' } })

  query = 'query { user { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { user: { id: '1', name: 'NAME' } } })
})

test('custom directives should work with single transform function', async (t) => {
  const app = Fastify()
  const schema = `
    ${upperDirectiveTypeDefs}
    
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
    schemaTransforms: upperDirectiveTransformer
  })

  await app.ready()

  let query = 'query { foo }'
  let res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { foo: 'BAR' } })

  query = 'query { user { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { user: { id: '1', name: 'NAME' } } })
})

test('custom directives should work with executable schema', async (t) => {
  const app = Fastify()
  const schema = `
    ${upperDirectiveTypeDefs}
    
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
  t.same(JSON.parse(res.body), { data: { foo: 'BAR' } })

  query = 'query { user { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { user: { id: '1', name: 'NAME' } } })
})

test('directives with extendSchema', async (t) => {
  const app = Fastify()

  const todos = []
  const typeDefs = `
   type AddTodoResponse {
     todos: [String]
   }
   extend type Query {
     todos: [String]
   }
   extend type Mutation {
     addTodo (input: TodoInput): AddTodoResponse
   }
   input TodoInput {
     todo: String! @length(max: 3)
   }
 `

  const resolvers = {
    Query: {
      todos: async () => todos
    },
    Mutation: {
      addTodo: async (_, { input: { todo } }) => {
        todos.push(todo)
        return { todos }
      }
    }
  }

  await app.register(mercurius, { defineMutation: true })

  app.graphql.extendSchema(lengthDirectiveTypeDefs)
  app.graphql.extendSchema(typeDefs)
  app.graphql.defineResolvers(resolvers)
  app.graphql.schema = lengthDirectiveTransformer(app.graphql.schema)

  const query = 'mutation { addTodo(input: { todo: "too-long" }) { todos } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400)
  t.same(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "StringWithLengthAtMost3", found "too-long"; expected length 8 to be at most 3',
      locations: [{ line: 1, column: 35 }],
      extensions: { foo: 'bar' }
    }]
  })
})

test('directives with transformSchema', async (t) => {
  const app = Fastify()

  const todos = []
  const typeDefs = `
   type AddTodoResponse {
     todos: [String]
   }
   extend type Query {
     todos: [String]
   }
   extend type Mutation {
     addTodo (input: TodoInput): AddTodoResponse
   }
   input TodoInput {
     todo: String! @length(max: 3)
   }
 `

  const resolvers = {
    Query: {
      todos: async () => todos
    },
    Mutation: {
      addTodo: async (_, { input: { todo } }) => {
        todos.push(todo)
        return { todos }
      }
    }
  }

  await app.register(mercurius, { defineMutation: true })

  app.graphql.extendSchema(lengthDirectiveTypeDefs)
  app.graphql.extendSchema(typeDefs)
  app.graphql.defineResolvers(resolvers)
  app.graphql.transformSchema(lengthDirectiveTransformer)

  const query = 'mutation { addTodo(input: { todo: "too-long" }) { todos } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400)
  t.same(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "StringWithLengthAtMost3", found "too-long"; expected length 8 to be at most 3',
      locations: [{ line: 1, column: 35 }],
      extensions: { foo: 'bar' }
    }]
  })
})

test('federation support and custom directives', async (t) => {
  const app = Fastify()
  const schema = `
    ${upperDirectiveTypeDefs}
    
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
  t.same(JSON.parse(res.body), { data: { _service: { sdl: schema } } })

  query = 'query { foo }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { foo: 'BAR' } })

  query = 'query { user { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { user: { id: '1', name: 'NAME' } } })
})

test('federation support using schema from buildFederationSchema and custom directives', async (t) => {
  const app = Fastify()
  const schema = `
    ${upperDirectiveTypeDefs}
    
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
  t.same(JSON.parse(res.body), { data: { _service: { sdl: schema } } })

  query = 'query { foo }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { foo: 'BAR' } })
})

test('max length directive validation works', async (t) => {
  const app = Fastify()
  const schema = `
  ${lengthDirectiveTypeDefs}
    type Query {
      foo(value: String!): String @length(max: 5)
      user(id: ID!): User
    }
    
    type Mutation {
      createUser(input: CreateUserInput!): User!
    }
    
    type User {
      id: ID!
      name: String @length(max: 5)
    }
    
    input CreateUserInput {
      id: ID!
      name: String! @length(max: 3)
    }
  `

  const users = [
    { id: '1', name: 'foo' },
    { id: '2', name: 'too-long' }
  ]

  const resolvers = {
    Query: {
      foo: (root, { value }) => value,
      user: (root, { id }) => users.find(user => user.id === id)
    },
    Mutation: {
      createUser: (root, args) => {
        users.push({ id: args.input.id, name: args.input.name })
        return { id: args.input.id }
      }
    }
  }

  const loaders = {
    User: {
      name: async (queries) => queries.map((query) => users.find(user => user.id === query.obj.id).name)
    }
  }

  app.register(mercurius, {
    schema,
    resolvers,
    loaders,
    schemaTransforms: [lengthDirectiveTransformer]
  })

  await app.ready()

  let query = 'query { foo(value: "bar") }'
  let res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { foo: 'bar' } })

  query = 'query { foo(value: "bar-too-long") }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), {
    data: { foo: null },
    errors: [{
      message: 'expected length 12 to be at most 5',
      locations: [{ line: 1, column: 9 }],
      path: ['foo'],
      extensions: { foo: 'bar' }
    }]
  })

  query = 'query { user(id: "1") { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { user: { id: '1', name: 'foo' } } })

  query = 'query { user(id: "2") { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), {
    data: { user: { id: 2, name: null } },
    errors: [{
      message: 'expected length 8 to be at most 5',
      locations: [{ line: 1, column: 28 }],
      path: ['user', 'name'],
      extensions: { foo: 'bar' }
    }]
  })

  query = 'mutation { createUser(input: {id: "3", name: "bar"}) { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), { data: { createUser: { id: '3', name: 'bar' } } })
  t.ok(users.find(user => user.id === '3'))

  query = 'mutation { createUser(input: {id: "4", name: "too-long"}) { id name } }'
  res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  t.same(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "StringWithLengthAtMost3", found "too-long"; expected length 8 to be at most 3',
      locations: [{ line: 1, column: 46 }],
      extensions: { foo: 'bar' }
    }]
  })
  t.notOk(users.find(user => user.id === '4'))
})

test('directives with array of typeDefs in schema option', async (t) => {
  const app = Fastify()

  const todos = []
  const typeDefs = `
   type AddTodoResponse {
     todos: [String]
   }
   type Query {
     todos: [String]
   }
   type Mutation {
     addTodo (input: TodoInput): AddTodoResponse
   }
   input TodoInput {
     todo: String! @length(max: 3)
   }
 `

  const resolvers = {
    Query: {
      todos: async () => todos
    },
    Mutation: {
      addTodo: async (_, { input: { todo } }) => {
        todos.push(todo)
        return { todos }
      }
    }
  }

  app.register(mercurius, {
    graphiql: true,
    schema: [lengthDirectiveTypeDefs, typeDefs],
    schemaTransforms: [lengthDirectiveTransformer],
    resolvers
  })

  const query = 'mutation { addTodo(input: { todo: "too-long" }) { todos } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400)
  t.same(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "StringWithLengthAtMost3", found "too-long"; expected length 8 to be at most 3',
      locations: [{ line: 1, column: 35 }],
      extensions: { foo: 'bar' }
    }]
  })
})

test('should support truthy skip directive', async t => {
  t.plan(1)

  const schema = `
type Query {
  me: User
}

type Metadata {
  info: String!
}

type User {
  id: ID!
  name: String!
  metadata(input: String!): Metadata!
}`

  const users = {
    u1: {
      id: 'u1',
      name: 'John'
    },
    u2: {
      id: 'u2',
      name: 'Jane'
    }
  }

  const resolvers = {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    },
    User: {
      metadata: (user, args, context, info) => {
        return {
          info: args.input
        }
      }
    }
  }

  const app = Fastify()
  t.teardown(app.close.bind(app))
  await app.register(mercurius, { schema, resolvers })

  const variables = {
    shouldSkip: true,
    input: 'hello'
  }
  const query = `
    query GetMe($input: String!, $shouldSkip: Boolean!) {
      me {
        id
        name
        metadata(input: $input) @skip(if: $shouldSkip) {
          info
        }
      }
    }`

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query, variables })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John'
      }
    }
  })
})

test('should support falsy skip directive', async t => {
  t.plan(1)

  const schema = `
type Query {
  me: User
}

type Metadata {
  info: String!
}

type User {
  id: ID!
  name: String!
  metadata(input: String!): Metadata!
}`

  const users = {
    u1: {
      id: 'u1',
      name: 'John'
    },
    u2: {
      id: 'u2',
      name: 'Jane'
    }
  }

  const resolvers = {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    },
    User: {
      metadata: (user, args, context, info) => {
        return {
          info: args.input
        }
      }
    }
  }

  const app = Fastify()
  t.teardown(app.close.bind(app))
  await app.register(mercurius, { schema, resolvers })

  const variables = {
    shouldSkip: false,
    input: 'hello'
  }
  const query = `
    query GetMe($input: String!, $shouldSkip: Boolean!) {
      me {
        id
        name
        metadata(input: $input) @skip(if: $shouldSkip) {
          info
        }
      }
    }`

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query, variables })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        metadata: {
          info: 'hello'
        }
      }
    }
  })
})

test('should support truthy include directive', async t => {
  t.plan(1)

  const schema = `
type Query {
  me: User
}

type Metadata {
  info: String!
}

type User {
  id: ID!
  name: String!
  metadata(input: String!): Metadata!
}`

  const users = {
    u1: {
      id: 'u1',
      name: 'John'
    },
    u2: {
      id: 'u2',
      name: 'Jane'
    }
  }

  const resolvers = {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    },
    User: {
      metadata: (user, args, context, info) => {
        return {
          info: args.input
        }
      }
    }
  }

  const app = Fastify()
  t.teardown(app.close.bind(app))
  await app.register(mercurius, { schema, resolvers })

  const variables = {
    shouldInclude: true,
    input: 'hello'
  }
  const query = `
    query GetMe($input: String!, $shouldInclude: Boolean!) {
      me {
        id
        name
        metadata(input: $input) @include(if: $shouldInclude) {
          info
        }
      }
    }`

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query, variables })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        metadata: {
          info: 'hello'
        }
      }
    }
  })
})

test('should support falsy include directive', async t => {
  t.plan(1)

  const schema = `
type Query {
  me: User
}

type Metadata {
  info: String!
}

type User {
  id: ID!
  name: String!
  metadata(input: String!): Metadata!
}`

  const users = {
    u1: {
      id: 'u1',
      name: 'John'
    },
    u2: {
      id: 'u2',
      name: 'Jane'
    }
  }

  const resolvers = {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    },
    User: {
      metadata: (user, args, context, info) => {
        return {
          info: args.input
        }
      }
    }
  }

  const app = Fastify()
  t.teardown(app.close.bind(app))
  await app.register(mercurius, { schema, resolvers })

  const variables = {
    shouldInclude: false,
    input: 'hello'
  }
  const query = `
    query GetMe($input: String!, $shouldInclude: Boolean!) {
      me {
        id
        name
        metadata(input: $input) @include(if: $shouldInclude) {
          info
        }
      }
    }`

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query, variables })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John'
      }
    }
  })
})

if (canUseIncrementalExecution) {
  const schema = `
    directive @defer(
      if: Boolean! = true
      label: String
    ) on FRAGMENT_SPREAD | INLINE_FRAGMENT

    type Query {
      allProducts: [Product!]!
    }
    
    type Product {
      delivery: DeliveryEstimates!
      sku: String!
      id: ID!
    }
    
    type DeliveryEstimates {
      estimatedDelivery: String!
      fastestDelivery: String!
    }`

  const allProducts = new Array(1).fill(0).map((_, index) => ({
    id: `${index}`,
    sku: 'sku'
  }))

  const resolvers = {
    Query: {
      allProducts: () => {
        return allProducts
      }
    },
    Product: {
      delivery: () => {
        return {
          estimatedDelivery: '25.01.2000',
          fastestDelivery: '25.01.2000'
        }
      }
    }
  }

  const query = `
    query deferVariation {
      allProducts {
        delivery {
          ...MyFragment @defer
        }
        sku
        id
      }
    }
  
    fragment MyFragment on DeliveryEstimates {
      estimatedDelivery
      fastestDelivery
    }
  `

  test('errors with @defer when used with wrong "accept" header', async t => {
    const wrongAcceptValues = [
      '',
      'application/json',
      'multipart/mixed',
      'multipart/mixed; deferSpec=12345'
    ]

    for (const accept of wrongAcceptValues) {
      const app = Fastify()
      await app.register(mercurius, { schema, resolvers, graphiql: true })

      const res = await app.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
          accept
        },
        body: JSON.stringify({ query })
      })

      t.match(res, {
        statusCode: 200,
        body: JSON.stringify({
          data: null,
          errors: [{
            message: "Mercurius server received an operation that uses incremental delivery (@defer or @stream), but the client does not accept multipart/mixed HTTP responses. To enable incremental delivery support, add the HTTP header 'Accept: multipart/mixed; deferSpec=20220824'."
          }]
        })
      })

      await app.close()
    }

    t.end()
  })

  test('works with @defer when used with correct "accept" header', async t => {
    const correctAcceptValues = [
      'multipart/mixed; deferSpec=20220824',
      'multipart/mixed; deferSpec=20220824, application/json',
      'application/json, multipart/mixed; deferSpec=20220824'
    ]

    for (const accept of correctAcceptValues) {
      const app = Fastify()
      await app.register(mercurius, { schema, resolvers, graphiql: true })

      const res = await app.inject({
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
          accept
        },
        body: JSON.stringify({ query })
      })

      t.match(res, {
        statusCode: 200,
        headers: {
          'content-type': 'multipart/mixed; boundary="-"; deferSpec=20220824'
        },
        body: `\r
---\r
content-type: application/json; charset=utf-8\r
\r
{"hasNext":true,"data":{"allProducts":[{"delivery":{},"sku":"sku","id":"0"}]}}\r
---\r
content-type: application/json; charset=utf-8\r
\r
{"hasNext":false,"incremental":[{"path":["allProducts",0,"delivery"],"data":{"estimatedDelivery":"25.01.2000","fastestDelivery":"25.01.2000"}}]}\r
-----\r
`
      })

      await app.close()
    }

    t.end()
  })
}
