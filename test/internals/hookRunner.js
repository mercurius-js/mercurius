'use strict'

const { test } = require('tap')
const { hookRunner, preExecutionHookRunner } = require('../../lib/hooks')

test('hookRunner - Basic', (t) => {
  t.plan(5)

  hookRunner([fn1, fn2, fn3], iterator, 'a', done)

  function iterator (fn, a, done) {
    return fn(a, done)
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

  function done (err, a) {
    t.error(err)
    t.strictEqual(a, 'a')
  }
})

test('hookRunner - In case of error should skip to done', (t) => {
  t.plan(4)

  hookRunner([fn1, fn2, fn3], iterator, 'a', done)

  function iterator (fn, a, done) {
    return fn(a, done)
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

  function done (err, a) {
    t.strictEqual(err.message, 'kaboom')
    t.strictEqual(a, 'a')
  }
})

test('hookRunner - Be able to exit before its natural end', (t) => {
  t.plan(2)

  let shouldStop = false
  hookRunner([fn1, fn2, fn3], iterator, 'a', done)

  function iterator (fn, a, done) {
    if (shouldStop) {
      return undefined
    }
    return fn(a, done)
  }

  function fn1 (a, done) {
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

  function done () {
    t.fail('this should not be called')
  }
})

test('hookRunner - Promises that resolve to a value do not change the state', (t) => {
  t.plan(5)

  const originalState = { a: 'a' }

  hookRunner([fn1, fn2, fn3], iterator, originalState, done)

  function iterator (fn, state, done) {
    return fn(state, done)
  }

  function fn1 (state, done) {
    t.strictEqual(state, originalState)
    return Promise.resolve(null)
  }

  function fn2 (state, done) {
    t.strictEqual(state, originalState)
    return Promise.resolve('string')
  }

  function fn3 (state, done) {
    t.strictEqual(state, originalState)
    return Promise.resolve({ object: true })
  }

  function done (err, state) {
    t.error(err)
    t.strictEqual(state, originalState)
  }
})

test('hookRunner - Should handle when iterator errors', (t) => {
  t.plan(2)

  hookRunner([fn1, fn2], iterator, 'a', done)

  function iterator (fn, a, done) {
    throw new Error('kaboom')
  }

  function fn1 (a) {
    t.fail('We should not be here')
  }

  function fn2 (a) {
    t.fail('We should not be here')
  }

  function done (err, a) {
    t.strictEqual(err.message, 'kaboom')
    t.strictEqual(a, 'a')
  }
})

test('preExecutionHookRunner - Basic', (t) => {
  t.plan(12)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  preExecutionHookRunner([fn1, fn2, fn3], originalRequest, originalExecutionResult, done)

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

  function done (err, request, executionResult) {
    t.error(err)
    t.deepEqual(request, { schema: 'schema', document: 'document', context: 'context' })
    t.deepEqual(executionResult, {})
  }
})

test('preExecutionHookRunner - In case of error should skip to done', (t) => {
  t.plan(9)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  preExecutionHookRunner([fn1, fn2, fn3], originalRequest, originalExecutionResult, done)

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

  function done (err, request, executionResult) {
    t.strictEqual(err.message, 'kaboom')
    t.deepEqual(request, { schema: 'schema', document: 'document', context: 'context' })
    t.deepEqual(executionResult, {})
  }
})

test('preExecutionHookRunner - Promises that resolve to a value do not change the request or execution result', (t) => {
  t.plan(12)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  preExecutionHookRunner([fn1, fn2, fn3], originalRequest, originalExecutionResult, done)

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

  function done (err, request, executionResult) {
    t.error(err)
    t.strictEqual(request, originalRequest)
    t.strictEqual(executionResult, originalExecutionResult)
  }
})

test('preExecutionHookRunner - Promises can modify a query document', (t) => {
  t.plan(6)

  const originalRequest = { schema: 'schema', document: { old: 'old' }, context: 'context' }
  const originalExecutionResult = {}

  preExecutionHookRunner([fn1], originalRequest, originalExecutionResult, done)

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.deepEqual(document, { old: 'old' })
    t.strictEqual(context, 'context')
    return Promise.resolve({ document: { new: 'new' } })
  }

  function done (err, request, executionResult) {
    t.error(err)
    t.deepEqual(request, { schema: 'schema', document: { new: 'new' }, context: 'context', modifiedQuery: true })
    t.deepEqual(executionResult, {})
  }
})

test('preExecutionHookRunner - Promises can add to existing execution errors', (t) => {
  t.plan(6)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  preExecutionHookRunner([fn1], originalRequest, originalExecutionResult, done)

  function fn1 (schema, document, context) {
    t.strictEqual(schema, 'schema')
    t.strictEqual(document, 'document')
    t.strictEqual(context, 'context')
    return Promise.resolve({ errors: [{ message: 'new errors' }] })
  }

  function done (err, request, executionResult) {
    t.error(err)
    t.deepEqual(request, { schema: 'schema', document: 'document', context: 'context' })
    t.deepEqual(executionResult.errors, [{ message: 'new errors' }])
  }
})

test('preExecutionHookRunner - Should handle thrown errors', t => {
  t.plan(9)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  preExecutionHookRunner([fn1, fn2, fn3], originalRequest, originalExecutionResult, done)

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

  function done (err, request, executionResult) {
    t.strictEqual(err.message, 'kaboom')
    t.deepEqual(request, { schema: 'schema', document: 'document', context: 'context' })
    t.deepEqual(executionResult, {})
  }
})

test('preExecutionHookRunner - Should handle non promise functions ', t => {
  t.plan(9)

  const originalRequest = { schema: 'schema', document: 'document', context: 'context' }
  const originalExecutionResult = {}

  preExecutionHookRunner([fn1, fn2], originalRequest, originalExecutionResult, done)

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

  function done (err, request, executionResult) {
    t.error(err)
    t.deepEqual(request, { schema: 'schema', document: 'document', context: 'context' })
    t.deepEqual(executionResult, {})
  }
})
