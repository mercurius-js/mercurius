'use strict'
const { test } = require('tap')
const Fastify = require('fastify')
const api = require('@opentelemetry/api')
const GQL = require('..')

test('Should add opentelemetry span and cached attribute', async (t) => {
  t.plan(6)

  class TestSpan extends api.NoopSpan {
    setAttribute (name, value) {
      t.is(name, 'mercurius.cached')
      t.is(value, false)
    }

    end () {
      t.pass()
    }
  }
  class TestTracer extends api.NoopTracer {
    startSpan (name, opts) {
      t.is(name, 'mercurius - graphql')
      t.deepEquals(opts, { parent: new api.NoopSpan() })
      return new TestSpan()
    }
  }
  class TestTracerProvider extends api.NoopTracerProvider {
    getTracer () {
      return new TestTracer()
    }
  }
  api.trace.setGlobalTracerProvider(new TestTracerProvider())

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

  app.get('/', async function (req, reply) {
    const query = '{ add(x: 2, y: 2) }'
    return reply.graphql(query)
  })

  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})
