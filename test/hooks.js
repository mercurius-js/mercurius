'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

async function createTestServer (t, customResolvers = resolvers) {
  const app = Fastify()
  t.tearDown(() => {
    app.close()
  })

  app.register(GQL, { schema, resolvers: customResolvers })

  // needed so that graphql is defined
  await app.ready()

  return app
}

// -----
// hooks
// -----
test('hooks', async t => {
  t.plan(6)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async function (request) {
    await sleep(1)
    t.is(request.source, query)
    t.ok('preParsing called')
  })

  app.graphql.addHook('preValidation', async function (request, reply) {
    await sleep(1)
    t.ok('preValidation called')
  })

  app.graphql.addHook('preExecution', async function (schema, document, context) {
    await sleep(1)
    t.ok('preExecution called')
  })

  app.graphql.addHook('onResolution', async function (request, reply) {
    await sleep(1)
    t.ok('onResolution called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('hooks can be called multiple times', async t => {
  t.plan(5)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async function (request) {
    await sleep(1)
    t.is(request.source, query)
    t.ok('preParsing called')
  })

  app.graphql.addHook('preParsing', async function (request) {
    await sleep(1)
    t.is(request.source, query)
    t.ok('preParsing called again')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
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
    t.strictEqual(e.message, 'unsupportedHook hook not supported!')
  }
})

test('hooks validation should handle invalid hook name types', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  try {
    app.graphql.addHook(1, async () => {})
  } catch (e) {
    t.strictEqual(e.code, 'MER_ERR_HOOK_INVALID_TYPE')
    t.strictEqual(e.message, 'The hook name must be a string')
  }
})

test('hooks validation should handle invalid hook handlers', async t => {
  t.plan(2)
  const app = await createTestServer(t)

  try {
    app.graphql.addHook('preParsing', 'not a function')
  } catch (e) {
    t.strictEqual(e.code, 'MER_ERR_HOOK_INVALID_HANDLER')
    t.strictEqual(e.message, 'The hook callback must be a function')
  }
})

// -----------
// preParsing
// -----------
test('preParsing hooks should handle errors', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  app.graphql.addHook('preParsing', async (request) => {
    throw new Error('a preParsing error occured')
  })

  app.graphql.addHook('preParsing', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preValidation', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (request) => {
    t.fail('this should not be called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preParsing error occured'
      }
    ]
  })
})

// --------------
// preValidation
// --------------
test('preValidation hooks should handle errors', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  app.graphql.addHook('preValidation', async (request) => {
    throw new Error('a preValidation error occured')
  })

  app.graphql.addHook('preValidation', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (request) => {
    t.fail('this should not be called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preValidation error occured'
      }
    ]
  })
})

// -------------
// preExecution
// -------------
test('preExecution hooks should handle errors', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  app.graphql.addHook('preExecution', async (request) => {
    throw new Error('a preExecution error occured')
  })

  app.graphql.addHook('preExecution', async (request) => {
    t.fail('this should not be called')
  })

  app.graphql.addHook('onResolution', async (request) => {
    t.fail('this should not be called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a preExecution error occured'
      }
    ]
  })
})

test('preExecution hooks should be able to modify the query document AST', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  const query = '{ add(x: 2, y: 2) }'

  app.graphql.addHook('preExecution', async (schema, document, context) => {
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

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 10
    }
  })
})

test('preExecution hooks should be able to add to the errors array', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  const query = '{ add(x: 2, y: 2) }'

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    return {
      errors: [new Error('foo')]
    }
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    return {
      errors: [new Error('bar')]
    }
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
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
  t.plan(1)
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
    return {
      errors: [new Error('foo')]
    }
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    return {
      errors: [new Error('bar')]
    }
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
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
// onResolution
// -------------
test('onResolution hooks should handle errors', async t => {
  t.plan(1)
  const app = await createTestServer(t)

  app.graphql.addHook('onResolution', async (request) => {
    throw new Error('a onResolution error occured')
  })

  app.graphql.addHook('onResolution', async (request) => {
    t.fail('this should not be called')
  })

  await app.listen(0)

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [
      {
        message: 'a onResolution error occured'
      }
    ]
  })
})
