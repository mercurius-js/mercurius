'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('basic federation support', async (t) => {
  const app = Fastify()
  const schema = `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
    }
  `

  const resolvers = {
    Query: {
      me: () => {
        return {
          id: '1',
          name: 'John',
          username: '@john'
        }
      }
    },
    User: {
      __resolveReference: (object) => {
        return {
          id: object.id,
          name: 'John',
          username: '@john'
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    enableFederation: true
  })

  await app.ready()

  const query = '{ _service { sdl } }'
  const res = await app.inject({
    method: 'GET',
    url: `/graphql?query=${query}`
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      _service: {
        sdl: schema
      }
    }
  })
})

test('entities resolver returns correct value', async (t) => {
  const app = Fastify()
  const schema = `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
    }
  `

  const resolvers = {
    Query: {
      me: () => {
        return {
          id: '1',
          name: 'John',
          username: '@john'
        }
      }
    },
    User: {
      __resolveReference: (object) => {
        return {
          id: object.id,
          name: 'John',
          username: '@john'
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    enableFederation: true
  })

  await app.ready()

  const query = `
  {
    _entities(representations: [{ __typename: "User", id: "1"}]) {
      __typename
      ... on User {
        id
        username
        name
      }
    }
  }
  `
  const res = await app.inject({
    method: 'GET',
    url: `/graphql?query=${query}`
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      _entities: [{
        __typename: 'User',
        id: '1',
        username: '@john',
        name: 'John'
      }]
    }
  })
})
