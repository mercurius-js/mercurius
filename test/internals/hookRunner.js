'use strict'

const { test } = require('tap')
const { hooksRunner, preExecutionHooksRunner } = require('../../lib/hooks')

test('hooksRunner - Basic', (t) => {
  t.plan(3)

  hooksRunner([fn1, fn2, fn3], iterator, 'a')

  function iterator (fn, a) {
    return fn(a)
  }

  function fn1 (a) {
    t.strictEqual(a, 'a')
    return Promise.resolve()
  }

  function fn2 (a) {
    t.strictEqual(a, 'a')
    return Promise.resolve()
  }

  function fn3 (a) {
    t.strictEqual(a, 'a')
    return Promise.resolve()
  }
})

test('hooksRunner - In case of error should skip subsequent functions', async (t) => {
  t.plan(3)

  try {
    await hooksRunner([fn1, fn2, fn3], iterator, 'a')
  } catch (err) {
    t.strictEqual(err.message, 'kaboom')
  }

  function iterator (fn, a) {
    return fn(a)
  }

  function fn1 (a) {
    t.strictEqual(a, 'a')
    return Promise.resolve()
  }

  function fn2 (a) {
    t.strictEqual(a, 'a')
    return Promise.reject(new Error('kaboom'))
  }

  function fn3 () {
    t.fail('We should not be here')
  }
})

test('hooksRunner - Be able to exit before its natural end', async (t) => {
  t.plan(2)

  let shouldStop = false

  await hooksRunner([fn1, fn2, fn3], iterator, 'a')

  function iterator (fn, a) {
    if (shouldStop) {
      return undefined
    }
    return fn(a)
  }

  function fn1 (a) {
    t.strictEqual(a, 'a')
    return Promise.resolve()
  }

  function fn2 (a) {
    t.strictEqual(a, 'a')
    shouldStop = true
    return Promise.resolve()
  }

  function fn3 () {
    t.fail('this should not be called')
  }
})

test('hooksRunner - Promises that resolve to a value do not change the state', (t) => {
  t.plan(4)

  const originalState = { a: 'a' }

  hooksRunner([fn1, fn2, fn3, fn4], iterator, originalState)

  function iterator (fn, state) {
    return fn(state)
  }

  function fn1 (state) {
    t.strictEqual(state, originalState)
    return Promise.resolve(null)
  }

  function fn2 (state) {
    t.strictEqual(state, originalState)
    return Promise.resolve('string')
  }

  function fn3 (state) {
    t.strictEqual(state, originalState)
    return Promise.resolve({ object: true })
  }

  function fn4 (state) {
    t.strictEqual(state, originalState)
  }
})

test('hooksRunner - Should handle when iterator errors', async (t) => {
  t.plan(1)

  try {
    await hooksRunner([fn1, fn2], iterator, 'a')
  } catch (err) {
    t.strictEqual(err.message, 'kaboom')
  }

  function iterator (fn) {
    throw new Error('kaboom')
  }

  function fn1 () {
    t.fail('We should not be here')
  }

  function fn2 () {
    t.fail('We should not be here')
  }
})

test('preExecutionHooksRunner - Basic', (t) => {
  t.plan(9)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  preExecutionHooksRunner([fn1, fn2, fn3], originalRequest, originalExecutionResult)

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve()
  }

  function fn2 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve()
  }

  function fn3 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve()
  }
})

test('preExecutionHooksRunner - In case of error should skip subsequent functions', async (t) => {
  t.plan(7)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  try {
    await preExecutionHooksRunner([fn1, fn2, fn3], originalRequest, originalExecutionResult)
  } catch (err) {
    t.strictEqual(err.message, 'kaboom')
  }

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve()
  }

  function fn2 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.reject(new Error('kaboom'))
  }

  function fn3 (schema, document, context) {
    t.fail('We should not be here')
  }
})

test('preExecutionHooksRunner - Promises that resolve to a value do not change the request or execution result', async (t) => {
  t.plan(11)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}
  const request = clone(originalRequest)
  const executionResult = clone(originalExecutionResult)

  await preExecutionHooksRunner([fn1, fn2, fn3], request, executionResult)

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve(null)
  }

  function fn2 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve('string')
  }

  function fn3 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve({ object: true })
  }

  function clone (obj) {
    return JSON.parse(JSON.stringify(obj))
  }

  t.deepEqual(originalRequest, request)
  t.deepEqual(originalExecutionResult, executionResult)
})

test('preExecutionHooksRunner - Promises can modify a query document', async (t) => {
  t.plan(5)

  const originalRequest = { schema: 'schema', document: { old: 'old' }, context: 'context' }
  const originalExecutionResult = {}

  await preExecutionHooksRunner([fn1], originalRequest, originalExecutionResult)

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.deepEqual(document, { old: 'old' })
    t.strictEqual(context, 'context')
    return Promise.resolve({ document: { new: 'new' } })
  }

  t.deepEqual(originalRequest, { schema: 'schema', document: { new: 'new' }, context: 'context', modifiedQuery: true })
  t.deepEqual(originalExecutionResult, {})
})

test('preExecutionHooksRunner - Promises can add to existing execution errors', async (t) => {
  t.plan(5)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  await preExecutionHooksRunner([fn1], originalRequest, originalExecutionResult)

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve({ errors: [{ message: 'new errors' }] })
  }

  t.deepEqual(originalRequest, { schema: 'schema', document: 'document', context: 'context' })
  t.deepEqual(originalExecutionResult.errors, [{ message: 'new errors' }])
})

test('preExecutionHooksRunner - Should handle thrown errors', async t => {
  t.plan(9)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  try {
    await preExecutionHooksRunner([fn1, fn2, fn3], originalRequest, originalExecutionResult)
  } catch (err) {
    t.strictEqual(err.message, 'kaboom')
    t.deepEqual(originalRequest, { schema: 'schema', document: 'document', context: 'context' })
    t.deepEqual(originalExecutionResult, {})
  }

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve()
  }

  function fn2 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    throw new Error('kaboom')
  }

  function fn3 () {
    t.fail('We should not be here')
  }
})

test('preExecutionHooksRunner - Should handle non promise functions ', async t => {
  t.plan(8)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  await preExecutionHooksRunner([fn1, fn2], originalRequest, originalExecutionResult)

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve()
  }

  function fn2 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
  }
  t.deepEqual(originalRequest, { schema: 'schema', document: 'document', context: 'context' })
  t.deepEqual(originalExecutionResult, {})
})
