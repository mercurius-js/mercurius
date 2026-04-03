'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')
const sinon = require('sinon')

const schema = `
type User {
  name: String!
  password: String!
}

type Query {
  read: [User]
}
`

const resolvers = {
  Query: {
    read: async () => {
      return [
        {
          name: 'foo',
          password: 'bar'
        }
      ]
    }
  }
}

test('adaptive jit compiles in the background and is used by later requests', async t => {
  const app = Fastify()
  t.after(() => app.close())

  const compileQueryStub = sinon.stub()
  const queryStub = sinon.stub().resolves({
    data: {
      read: [
        {
          name: 'compiled',
          password: 'compiled'
        }
      ]
    }
  })

  compileQueryStub.returns({ query: queryStub })

  const createAdaptiveJit = proxyquire('../lib/adaptive-jit', {
    'node:perf_hooks': {
      performance: {
        eventLoopUtilization: sinon.stub().returns({ utilization: 0 })
      }
    }
  })

  const GQL = proxyquire('../index', {
    'graphql-jit': {
      compileQuery: compileQueryStub,
      isCompiledQuery: (query) => query && typeof query.query === 'function'
    },
    './lib/adaptive-jit': createAdaptiveJit
  })

  await app.register(GQL, {
    schema,
    resolvers,
    jit: {
      minCount: 2,
      eluThreshold: 0.8,
      maxCompilePerTick: 1,
      maxQueueSize: 100
    },
    compilerOptions: {
      customJSONSerializer: true
    }
  })

  const query = `{
    read {
      name
      password
    }
  }`

  await app.inject({
    method: 'POST',
    url: '/graphql',
    body: { query }
  })

  const secondResponse = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: { query }
  })

  t.assert.deepStrictEqual(secondResponse.json(), {
    data: {
      read: [
        {
          name: 'foo',
          password: 'bar'
        }
      ]
    }
  })
  t.assert.equal(queryStub.callCount, 0)

  await new Promise(resolve => setImmediate(resolve))

  sinon.assert.calledOnceWithExactly(compileQueryStub, sinon.match.any, sinon.match.any, sinon.match.any, { customJSONSerializer: true })

  const thirdResponse = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: { query }
  })

  t.assert.deepStrictEqual(thirdResponse.json(), {
    data: {
      read: [
        {
          name: 'compiled',
          password: 'compiled'
        }
      ]
    }
  })
  t.assert.equal(queryStub.callCount, 1)
})

test('adaptive jit waits for event loop headroom before compiling', async t => {
  const eluValues = [
    { utilization: 0 },
    { utilization: 0.95 },
    { utilization: 0 },
    { utilization: 0.2 },
    { utilization: 0 }
  ]

  const createAdaptiveJit = proxyquire('../lib/adaptive-jit', {
    'node:perf_hooks': {
      performance: {
        eventLoopUtilization: sinon.stub().callsFake(() => eluValues.shift() ?? { utilization: 0 })
      }
    }
  })

  const compileQueryStub = sinon.stub().returns({ query: async () => ({ data: { ok: true } }) })
  const adaptiveJit = createAdaptiveJit({
    getSchema: () => ({ name: 'schema' }),
    compileQuery: compileQueryStub,
    minCount: 1,
    eluThreshold: 0.8,
    maxCompilePerTick: 1,
    maxQueueSize: 100
  })

  const cached = {
    count: 1,
    jit: null
  }

  adaptiveJit.maybeEnqueue(cached, { kind: 'Document' }, 'TestQuery')

  await new Promise(resolve => setImmediate(resolve))
  t.assert.equal(compileQueryStub.callCount, 0)

  await new Promise(resolve => setTimeout(resolve, 70))
  t.assert.equal(compileQueryStub.callCount, 1)
})

test('adaptive jit clears pending timer handles', async t => {
  let immediateCallback
  const immediateHandle = { unref: sinon.stub() }
  const timeoutHandle = { unref: sinon.stub() }

  const setImmediateStub = sinon.stub(global, 'setImmediate').callsFake((fn) => {
    immediateCallback = fn
    return immediateHandle
  })
  const clearImmediateStub = sinon.stub(global, 'clearImmediate')
  const setTimeoutStub = sinon.stub(global, 'setTimeout').callsFake(() => timeoutHandle)
  const clearTimeoutStub = sinon.stub(global, 'clearTimeout')

  t.after(() => {
    setImmediateStub.restore()
    clearImmediateStub.restore()
    setTimeoutStub.restore()
    clearTimeoutStub.restore()
  })

  const createAdaptiveJit = proxyquire('../lib/adaptive-jit', {
    'node:perf_hooks': {
      performance: {
        eventLoopUtilization: sinon.stub().returns({ utilization: 0.95 })
      }
    }
  })

  const adaptiveJit = createAdaptiveJit({
    getSchema: () => ({ name: 'schema' }),
    compileQuery: sinon.stub(),
    minCount: 1,
    eluThreshold: 0.8,
    maxCompilePerTick: 1,
    maxQueueSize: 100
  })

  adaptiveJit.maybeEnqueue({ count: 1, jit: null }, { kind: 'Document' }, 'TestQuery')
  sinon.assert.calledOnce(setImmediateStub)

  immediateCallback()
  sinon.assert.calledOnce(setTimeoutStub)

  adaptiveJit.clear()
  sinon.assert.calledOnce(clearTimeoutStub)
  sinon.assert.calledWithExactly(clearTimeoutStub, timeoutHandle)
  sinon.assert.notCalled(clearImmediateStub)
})

test('adaptive jit is cleared when the fastify server closes', async t => {
  const app = Fastify()

  const clearStub = sinon.stub()
  const createAdaptiveJitStub = sinon.stub().returns({
    maybeEnqueue: sinon.stub(),
    clear: clearStub
  })

  const GQL = proxyquire('../index', {
    './lib/adaptive-jit': createAdaptiveJitStub
  })

  await app.register(GQL, {
    schema,
    resolvers,
    jit: {
      minCount: 2
    }
  })

  await app.close()
  sinon.assert.calledOnce(clearStub)
})
