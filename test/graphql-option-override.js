'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('..')

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
    read: async (_, obj) => {
      return [
        {
          name: 'foo',
          password: 'bar'
        }
      ]
    }
  }
}

const query = `{
  read {
    name
    password
  }
}`

const query2 = `{
  read {
    intentionallyUnknownField1
    intentionallyUnknownField2
    intentionallyUnknownField3
  }
}`

test('do not override graphql function options', async t => {
  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(mercurius, {
    schema,
    resolvers
  })

  await app.ready()

  const res = await app.graphql(query)

  const expectedResult = {
    data: {
      read: [{
        name: 'foo',
        password: 'bar'
      }]
    }
  }

  t.same(res, expectedResult)
})

test('override graphql.parse options', async t => {
  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(mercurius, {
    schema,
    resolvers,
    graphql: {
      parseOptions: {
        maxTokens: 1
      }
    }
  })

  await app.ready()

  const expectedErr = {
    errors: [{
      message: 'Syntax Error: Document contains more that 1 tokens. Parsing aborted.'
    }]
  }

  await t.rejects(app.graphql(query), expectedErr)
})

test('do not override graphql.validate options', async t => {
  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(mercurius, {
    schema,
    resolvers
  })

  await app.ready()

  const expectedErr = {
    errors: [
      { message: 'Cannot query field "intentionallyUnknownField1" on type "User".' },
      { message: 'Cannot query field "intentionallyUnknownField2" on type "User".' },
      { message: 'Cannot query field "intentionallyUnknownField3" on type "User".' }
    ]
  }

  await t.rejects(app.graphql(query2), expectedErr)
})

test('override graphql.validate options', async t => {
  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(mercurius, {
    schema,
    resolvers,
    graphql: {
      validateOptions: {
        maxErrors: 1
      }
    }
  })

  await app.ready()

  const expectedErr = {
    errors: [
      { message: 'Cannot query field "intentionallyUnknownField1" on type "User".' },
      { message: 'Too many validation errors, error limit reached. Validation aborted.' }
    ]
  }

  await t.rejects(app.graphql(query2), expectedErr)
})
