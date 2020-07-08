'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { GraphQLError } = require('graphql')
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
  t.plan(2)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    validationRules: [
      // validation rule that reports an error
      function (context) {
        return {
          Document () {
            context.reportError(new GraphQLError('Validation rule error'))
          }
        }
      }
    ]
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql(query)
  } catch (e) {
    t.equal(e.errors.length, 1)
    t.equal(e.errors[0].message, 'Validation rule error')
  }
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
  t.deepEqual(res, { data: { add: 4 } })
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
  t.deepEqual(res, { data: { add: 4 } })
})

test('validationRules - reports an error', async (t) => {
  t.plan(2)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    validationRules: () => [
      // validation rule that reports an error
      function (context) {
        return {
          Document () {
            context.reportError(new GraphQLError('Validation rule error'))
          }
        }
      }
    ]
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql(query)
  } catch (e) {
    t.equal(e.errors.length, 1)
    t.equal(e.errors[0].message, 'Validation rule error')
  }
})

test('validationRules - passes when no errors', async (t) => {
  t.plan(1)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
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
  t.deepEqual(res, { data: { add: 4 } })
})

test('validationRules - works with empty validationRules', async (t) => {
  t.plan(1)
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    validationRules: () => []
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)
  t.deepEqual(res, { data: { add: 4 } })
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
  t.deepEqual(res, { data: { add: 4 } })
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
    validationRules: function ({ source, variables, operationName }) {
      t.equal(source, query)
      t.deepEqual(variables, { x: 2, y: 2 })
      t.deepEqual(operationName, 'Add')
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
  t.deepEqual(res, { data: { add: 4 } })
})
