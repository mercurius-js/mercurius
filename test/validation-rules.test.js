'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const GQL = require('..')

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

test('validationRules array - reports an error', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    validationRules: [
      // validation rule that reports an error
      function (context) {
        return {
          Document () {
            context.reportError({ message: 'Validation rule error' })
          }
        }
      }
    ]
  })

  // needed so that graphql is defined
  await app.ready()
  await t.assert.rejects(app.graphql(query), { errors: [{ message: 'Validation rule error' }] })
})

test('validationRules array - passes when no errors', async (t) => {
  t.plan(1)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    validationRules: [
      // validation rule that reports no errors
      function (_context) {
        return {
          Document () {
            return false
          }
        }
      }
    ]
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)
  t.assert.deepStrictEqual(res.data.add, 4)
})

test('validationRules array - works with empty validationRules', async (t) => {
  t.plan(1)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    validationRules: []
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)
  t.assert.deepStrictEqual(res.data.add, 4)
})

test('validationRules - reports an error', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    cache: false,
    validationRules: () => [
      // validation rule that reports an error
      function (context) {
        return {
          Document () {
            context.reportError({ message: 'Validation rule error' })
          }
        }
      }
    ]
  })

  // needed so that graphql is defined
  await app.ready()
  await t.assert.rejects(app.graphql(query), { errors: [{ message: 'Validation rule error' }] })
})

test('validationRules - passes when no errors', async (t) => {
  t.plan(1)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    cache: false,
    validationRules: () => [
      // validation rule that reports no errors
      function (_context) {
        return {
          Document () {
            return false
          }
        }
      }
    ]
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)
  t.assert.deepStrictEqual(res.data.add, 4)
})

test('validationRules - works with empty validationRules', async (t) => {
  t.plan(1)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    cache: false,
    validationRules: () => []
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)
  t.assert.deepStrictEqual(res.data.add, 4)
})

test('validationRules - works with missing validationRules', async (t) => {
  t.plan(1)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    validationRules: undefined
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)
  t.assert.deepStrictEqual(res.data.add, 4)
})

test('validationRules - includes graphql request metadata', async (t) => {
  t.plan(4)
  const app = Fastify()

  const query = `
    query Add ($x: Int!, $y: Int!) {
      add(x: $x, y: $y)
    }
  `

  app.register(GQL, {
    schema,
    resolvers,
    cache: false,
    validationRules: function ({ source, variables, operationName }) {
      t.assert.strictEqual(source, query)
      t.assert.deepStrictEqual(variables, { x: 2, y: 2 })
      t.assert.deepStrictEqual(operationName, 'Add')
      return [
        // validation rule that reports no errors
        function (_context) {
          return {
            Document () {
              return false
            }
          }
        }
      ]
    }
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query, null, { x: 2, y: 2 }, 'Add')
  t.assert.deepStrictEqual(res.data.add, 4)
})

test('validationRules - errors if cache is used with the function', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    cache: true,
    validationRules: () => []
  })

  // needed so that graphql is defined
  await t.assert.rejects(app.ready(), { message: 'Invalid options: Using a function for the validationRules is incompatible with query caching' })
})
