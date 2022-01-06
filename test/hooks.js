'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')
const { mapSchema } = require('@graphql-tools/utils')
const { parse, buildSchema, GraphQLSchema } = require('graphql')
const { promisify } = require('util')
const GQL = require('..')
const { ErrorWithProps } = GQL

const immediate = promisify(setImmediate)

process.removeAllListeners('warning')

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

const query = '{ add(x: 2, y: 2) }'

function createTestServer (t, customResolvers = resolvers, opts = {}) {
  const app = Fastify()
  t.teardown(() => app.close())

  app.register(GQL, { schema, resolvers: customResolvers, ...opts })

  return app
}

// -----
// hooks
// -----
test('hooks', async t => {
  t.plan(16)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async function (schema, source, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.ok('preParsing called')
  })

  app.graphql.addHook('preValidation', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preValidation called')
  })

  app.graphql.addHook('preExecution', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preExecution called')
  })

  app.graphql.addHook('preGatewayExecution', async function (schema, document, context) {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async function (execution, context) {
    await immediate()
    t.type(execution, 'object')
    t.type(context, 'object')
    t.ok('onResolution called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('hooks can be called multiple times', async t => {
  t.plan(9)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async function (schema, source, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.ok('preParsing called')
  })

  app.graphql.addHook('preParsing', async function (schema, source, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.ok('preParsing called again')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('hooks validation should handle invalid hook names', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  try {
    app.graphql.addHook('unsupportedHook', async () => {})
  } catch (e) {
    t.equal(e.message, 'unsupportedHook hook not supported!')
  }
})

test('hooks validation should handle invalid hook name types', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  try {
    app.graphql.addHook(1, async () => {})
  } catch (e) {
    t.equal(e.code, 'MER_ERR_HOOK_INVALID_TYPE')
    t.equal(e.message, 'The hook name must be a string')
  }
})

test('hooks validation should handle invalid hook handlers', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  try {
    app.graphql.addHook('preParsing', 'not a function')
  } catch (e) {
    t.equal(e.code, 'MER_ERR_HOOK_INVALID_HANDLER')
    t.equal(e.message, 'The hook callback must be a function')
  }
})

test('hooks should trigger when JIT is enabled', async t => {
  t.plan(28)
  const app = await createTestServer(t, resolvers, { jit: 1 })

  app.graphql.addHook('preParsing', async function (schema, source, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.ok('preParsing called')
  })

  // preValidation is not triggered a second time
  app.graphql.addHook('preValidation', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preValidation called')
  })

  app.graphql.addHook('preExecution', async function (schema, document, context) {
    await immediate()
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.ok('preExecution called')
  })

  app.graphql.addHook('preGatewayExecution', async function (schema, document, context) {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async function (execution, context) {
    await immediate()
    t.type(execution, 'object')
    t.type(context, 'object')
    t.ok('onResolution called')
  })

  {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        add: 4
      }
    })
  }

  {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        add: 4
      }
    })
  }
})

// -----------
// preParsing
// -----------
test('preParsing hooks should handle errors', async t => {
  t.plan(4)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    throw new Error('a preParsing error occured')
  })

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preParsing error occured'
      }
    ]
  })
})

test('preParsing hooks should handle ErrorWithProps', async t => {
  t.plan(4)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    throw new ErrorWithProps('a preParsing error occured', { code: 'USER_ID_INVALID' })
  })

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preParsing error occured',
        extensions: {
          code: 'USER_ID_INVALID'
        }
      }
    ]
  })
})

test('preParsing hooks should be able to put values onto the context', async t => {
  t.plan(8)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('preParsing', async (schema, source, context) => {
    t.type(schema, GraphQLSchema)
    t.equal(source, query)
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

// --------------
// preValidation
// --------------
test('preValidation hooks should handle errors', async t => {
  t.plan(4)
  const app = await createTestServer(t)

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    throw new Error('a preValidation error occured')
  })

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preValidation error occured'
      }
    ]
  })
})

test('preValidation hooks should be able to put values onto the context', async t => {
  t.plan(8)
  const app = await createTestServer(t)

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('preValidation', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

// -------------
// preExecution
// -------------
test('preExecution hooks should handle errors', async t => {
  t.plan(4)
  const app = await createTestServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    throw new Error('a preExecution error occured')
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preExecution error occured'
      }
    ]
  })
})

test('preExecution hooks should be able to put values onto the context', async t => {
  t.plan(8)
  const app = await createTestServer(t)

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('preExecution hooks should be able to modify the query document AST', async t => {
  t.plan(4)
  const app = await createTestServer(t)

  const query = '{ add(x: 2, y: 2) }'

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    const modifiedDocument = {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation: 'query',
          variableDefinitions: [],
          directives: [],
          selectionSet: {
            kind: 'SelectionSet',
            selections: [
              {
                kind: 'Field',
                name: { kind: 'Name', value: 'add', loc: { start: 2, end: 5 } },
                arguments: [
                  {
                    kind: 'Argument',
                    name: { kind: 'Name', value: 'x', loc: { start: 6, end: 7 } },
                    value: { kind: 'IntValue', value: '5', loc: { start: 9, end: 10 } },
                    loc: { start: 6, end: 10 }
                  },
                  {
                    kind: 'Argument',
                    name: { kind: 'Name', value: 'y', loc: { start: 12, end: 13 } },
                    value: { kind: 'IntValue', value: '5', loc: { start: 15, end: 16 } },
                    loc: { start: 12, end: 16 }
                  }
                ],
                directives: [],
                loc: { start: 2, end: 17 }
              }
            ],
            loc: { start: 0, end: 19 }
          },
          loc: { start: 0, end: 19 }
        }
      ],
      loc: { start: 0, end: 19 }
    }
    return {
      document: modifiedDocument
    }
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 10
    }
  })
})

test('preExecution hooks should be able to modify the schema document AST', async t => {
  t.plan(8)
  const app = await createTestServer(t)

  const query = `{ 
    __type(name:"Query") { 
      name
      fields {
        name
      }  
    }
  }`

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')

    if (context.reply.request.headers.role === 'super-user') {
      const modifiedSchema = `
        type Query {
          add(x: Int, y: Int): Int
          subtract(x: Int, y: Int): Int
        }
      `

      return {
        schema: buildSchema(modifiedSchema)
      }
    }
  })

  const reqSuper = app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', role: 'super-user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  }).then(res => {
    t.same(JSON.parse(res.body), {
      data: {
        __type: {
          name: 'Query',
          fields: [
            { name: 'add' },
            { name: 'subtract' }
          ]
        }
      }
    })
  })

  const reqNotSuper = app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', role: 'not-a-super-user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  }).then(res => {
    t.same(JSON.parse(res.body), {
      data: {
        __type: {
          name: 'Query',
          fields: [
            { name: 'add' }
          ]
        }
      }
    })
  })

  await Promise.all([reqSuper, reqNotSuper])
})

test('cache skipped when the GQL Schema has been changed', async t => {
  t.plan(4)

  const app = Fastify()
  t.teardown(() => app.close())

  const plugin = proxyquire('../index', {
    'graphql-jit': {
      compileQuery () {
        t.pass('the jit is called once')
        return null
      }
    }
  })

  await app.register(plugin, { schema, resolvers, jit: 1 })
  await app

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    if (context.reply.request.headers.original === 'ok') {
      return
    }

    return {
      schema: mapSchema(schema)
    }
  })

  const query = '{ add(x:1, y:2) }'

  {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', original: 'ok' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
    t.same(res.json(), { data: { add: 3 } }, 'this call warm up the jit counter')
  }

  {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', original: 'NO' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
    t.same(res.json(), { data: { add: 3 } }, 'this call MUST not trigger the jit')
  }

  {
    const res = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', original: 'ok' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
    t.same(res.json(), { data: { add: 3 } }, 'this call triggers the jit cache')
  }
})

test('preExecution hooks should be able to add to the errors array', async t => {
  t.plan(7)
  const app = await createTestServer(t)

  const query = '{ add(x: 2, y: 2) }'

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    return {
      errors: [new Error('foo')]
    }
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    return {
      errors: [new Error('bar')]
    }
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    },
    errors: [
      {
        message: 'foo'
      },
      {
        message: 'bar'
      }
    ]
  })
})

test('preExecution hooks should be able to add to the errors array that is already populated with execution errors', async t => {
  t.plan(7)
  const resolvers = {
    Query: {
      add: async (_, obj) => {
        throw new Error('resolver error')
      }
    }
  }

  const app = await createTestServer(t, resolvers)

  const query = '{ add(x: 2, y: 2) }'

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    return {
      errors: [new Error('foo')]
    }
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.type(schema, GraphQLSchema)
    t.same(document, parse(query))
    t.type(context, 'object')
    return {
      errors: [new Error('bar')]
    }
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: null
    },
    errors: [
      {
        message: 'resolver error',
        locations: [{ line: 1, column: 3 }],
        path: ['add']
      },
      {
        message: 'foo'
      },
      {
        message: 'bar'
      }
    ]
  })
})

// -------------
// preGatewayExecution
// -------------
test('preGatewayExecution hooks should never be called in a non-gateway graphql server', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  app.graphql.addHook('preGatewayExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

// -------------
// onResolution
// -------------
test('onResolution hooks should handle errors', async t => {
  t.plan(3)
  const app = await createTestServer(t)

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(context, 'object')
    throw new Error('a onResolution error occured')
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.fail('this should not be called')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a onResolution error occured'
      }
    ]
  })
})

test('onResolution hooks should be able to put values onto the context', async t => {
  t.plan(6)
  const app = await createTestServer(t)

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(context, 'object')
    context.foo = 'bar'
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(context, 'object')
    t.equal(context.foo, 'bar')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('onResolution hooks should be able to add extensions data', async t => {
  t.plan(5)

  const app = await createTestServer(t)

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')

    execution.extensions = {
      extensionKey: 'extensionValue'
    }
  })

  app.graphql.addHook('onResolution', async (execution, context) => {
    t.type(execution, 'object')
    t.type(execution.extensions, 'object')
    t.equal(execution.extensions.extensionKey, 'extensionValue')
  })

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      add: 4
    },
    extensions: {
      extensionKey: 'extensionValue'
    }
  })
})
