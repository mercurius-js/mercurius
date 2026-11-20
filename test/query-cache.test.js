'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const GQL = require('..')
const QueryCache = require('../lib/query-cache')

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y
  }
}

test('QueryCache evicts the least recently used entry when full', t => {
  const cache = new QueryCache({ maxEntries: 2, maxSize: 100 })

  cache.set('a', 1)
  cache.set('b', 2)
  t.assert.strictEqual(cache.get('a'), 1)
  cache.set('c', 3)

  t.assert.strictEqual(cache.get('a'), 1)
  t.assert.strictEqual(cache.get('b'), undefined)
  t.assert.strictEqual(cache.get('c'), 3)
})

test('QueryCache evicts entries until the total size of the keys fits', t => {
  const cache = new QueryCache({ maxEntries: 100, maxSize: 10 })

  cache.set('aaaa', 1)
  cache.set('bbbb', 2)
  t.assert.strictEqual(cache.size, 8)

  cache.set('cccc', 3)
  t.assert.strictEqual(cache.size, 8)
  t.assert.strictEqual(cache.get('aaaa'), undefined)
  t.assert.strictEqual(cache.get('bbbb'), 2)
  t.assert.strictEqual(cache.get('cccc'), 3)
})

test('QueryCache does not store a key larger than the maximum size', t => {
  const cache = new QueryCache({ maxEntries: 100, maxSize: 10 })

  cache.set('a', 1)
  cache.set('x'.repeat(11), 2)

  t.assert.strictEqual(cache.get('x'.repeat(11)), undefined)
  t.assert.strictEqual(cache.get('a'), 1)
  t.assert.strictEqual(cache.size, 1)
})

test('QueryCache replaces an existing key without counting it twice', t => {
  const cache = new QueryCache({ maxEntries: 100, maxSize: 10 })

  cache.set('aaaa', 1)
  cache.set('aaaa', 2)

  t.assert.strictEqual(cache.get('aaaa'), 2)
  t.assert.strictEqual(cache.size, 4)
})

test('QueryCache counts object keys by number of entries only', t => {
  const cache = new QueryCache({ maxEntries: 2, maxSize: 1 })
  const a = {}
  const b = {}
  const c = {}

  cache.set(a, 1)
  cache.set(b, 2)
  cache.set(c, 3)

  t.assert.strictEqual(cache.size, 0)
  t.assert.strictEqual(cache.get(a), undefined)
  t.assert.strictEqual(cache.get(b), 2)
  t.assert.strictEqual(cache.get(c), 3)
})

test('QueryCache clear', t => {
  const cache = new QueryCache({ maxEntries: 10, maxSize: 10 })

  cache.set('a', 1)
  cache.clear()

  t.assert.strictEqual(cache.get('a'), undefined)
  t.assert.strictEqual(cache.size, 0)
})

test('cached validation errors do not reference the parsed document', async t => {
  const app = Fastify()
  t.after(() => app.close())

  const seen = []
  app.register(GQL, {
    schema,
    resolvers,
    errorFormatter: (execution, ctx) => {
      seen.push(execution.errors[0].originalError.errors)
      return GQL.defaultErrorFormatter(execution, ctx)
    }
  })

  const query = '{ add(x: 1, y: 2) }\n{ add(x: 3, y: 4) }'

  const first = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
  const second = await app.inject({ method: 'POST', url: '/graphql', body: { query } })

  t.assert.strictEqual(second.statusCode, first.statusCode)
  t.assert.deepStrictEqual(second.json(), first.json())
  t.assert.deepStrictEqual(second.json().errors[1].locations, [{ line: 2, column: 1 }])

  const [missErrors, hitErrors] = seen
  t.assert.notStrictEqual(hitErrors, missErrors)
  t.assert.strictEqual(hitErrors.length, 2)
  for (const error of hitErrors) {
    t.assert.strictEqual(error.nodes, undefined)
    t.assert.strictEqual(error.source, undefined)
    t.assert.strictEqual(error.positions, undefined)
    t.assert.strictEqual(typeof error.stack, 'string')
  }
})

test('queries longer than cacheMaxSize are not cached', async t => {
  const app = Fastify()
  t.after(() => app.close())

  const short = '{ add(x: 1, y: 2) }'
  const long = `{ add(x: 1, y: 2) } # ${'x'.repeat(100)}`

  let validations = 0
  app.register(GQL, { schema, resolvers, cacheMaxSize: 50 })
  app.register(async function (app) {
    app.graphql.addHook('preValidation', async () => {
      validations++
    })
  })

  for (const query of [short, short, long, long]) {
    const res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
    t.assert.deepStrictEqual(res.json(), { data: { add: 3 } })
  }

  // the short query is validated once, the long one every time
  t.assert.strictEqual(validations, 3)
})

test('invalid queries longer than cacheMaxSize are not cached', async t => {
  const app = Fastify()
  t.after(() => app.close())

  const query = `{ add(x: 1, y: 2) } { add(x: 1, y: 2) } # ${'x'.repeat(100)}`

  let validations = 0
  app.register(GQL, { schema, resolvers, cacheMaxSize: 50 })
  app.register(async function (app) {
    app.graphql.addHook('preValidation', async () => {
      validations++
    })
  })

  for (let i = 0; i < 2; i++) {
    const res = await app.inject({ method: 'POST', url: '/graphql', body: { query } })
    t.assert.strictEqual(res.json().errors.length, 2)
  }

  t.assert.strictEqual(validations, 2)
})

test('options cache must be greater than 0', async t => {
  const app = Fastify()

  app.register(GQL, { schema, cache: 0 })

  await t.assert.rejects(app.ready(), { message: 'Invalid options: the cache option must be a number greater than 0' })
})

for (const cacheMaxSize of [0, -1, '1024', NaN]) {
  test(`options cacheMaxSize rejects ${String(cacheMaxSize)}`, async t => {
    const app = Fastify()

    app.register(GQL, { schema, cacheMaxSize })

    await t.assert.rejects(app.ready(), { message: 'Invalid options: the cacheMaxSize option must be a number greater than 0' })
  })
}
