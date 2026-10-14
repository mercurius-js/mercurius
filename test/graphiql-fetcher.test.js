'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const vm = require('node:vm')

// Runs the GraphiQL page script with just enough of a browser for it to
// load, and returns its fetcherWrapper. The scripts it adds never load.
function loadFetcherWrapper () {
  const element = () => ({ addEventListener () {}, appendChild () {} })
  const context = {
    window: { GRAPHIQL_PLUGIN_LIST: [] },
    navigator: {},
    document: {
      createElement: element,
      body: element(),
      getElementsByTagName: () => [element()]
    }
  }
  vm.runInNewContext(readFileSync(join(__dirname, '../static/main.js'), 'utf8'), context)
  return context.fetcherWrapper
}

const fetcherWrapper = loadFetcherWrapper()

async function * events () {
  yield { data: { ticks: 1 } }
  yield { data: { ticks: 2 } }
  yield { data: { ticks: 3 } }
}

async function collect (iterable) {
  const values = []
  for await (const value of iterable) {
    values.push(value)
  }
  return values
}

test('without fetcherWrapper plugins, GraphiQL gets the fetcher itself', () => {
  const fetcher = async () => ({ data: {} })
  assert.strictEqual(fetcherWrapper(fetcher), fetcher)
  assert.strictEqual(fetcherWrapper(fetcher, []), fetcher)
})

test('fetcherWrapper plugins wrap the result of a query', async () => {
  const fetcher = fetcherWrapper(async () => ({ data: { add: 4 } }), [
    result => ({ ...result, first: true }),
    result => ({ ...result, second: result.first })
  ])

  assert.deepStrictEqual(await fetcher({ query: '{ add(x: 2, y: 2) }' }), {
    data: { add: 4 },
    first: true,
    second: true
  })
})

test('fetcherWrapper plugins wrap every event of a subscription', async () => {
  const fetcher = fetcherWrapper(async () => events(), [
    result => ({ ...result, wrapped: true })
  ])

  assert.deepStrictEqual(await collect(await fetcher({ query: 'subscription { ticks }' })), [
    { data: { ticks: 1 }, wrapped: true },
    { data: { ticks: 2 }, wrapped: true },
    { data: { ticks: 3 }, wrapped: true }
  ])
})

test('closing a wrapped subscription closes the subscription of the fetcher', async () => {
  let closed = false
  async function * subscription () {
    try {
      yield * events()
    } finally {
      closed = true
    }
  }

  const fetcher = fetcherWrapper(async () => subscription(), [result => result])
  const iterator = (await fetcher({ query: 'subscription { ticks }' }))[Symbol.asyncIterator]()

  const { value, done } = await iterator.next()
  assert.deepStrictEqual({ value, done }, { value: { data: { ticks: 1 } }, done: false })
  assert.strictEqual(closed, false)
  await iterator.return()
  assert.strictEqual(closed, true)
})
