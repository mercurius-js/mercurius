'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { printSchema } = require('graphql')
const GQL = require('..')
const { buildFederationSchema } = require('../lib/federation')

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
      __resolveReference: (reference) => {
        return {
          id: reference.id,
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

test('entities resolver returns correct value with async resolver', async (t) => {
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
      __resolveReference: (reference) => {
        return Promise.resolve({
          id: reference.id,
          name: 'John',
          username: '@john'
        })
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

test('entities resolver returns user default resolver if resolveReference is not set', async (t) => {
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
        username: null,
        name: null
      }]
    }
  })
})

test('entities resolver throws an error if reference type name not in schema', async (t) => {
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
    _entities(representations: [{ __typename: "Account", id: "1"}]) {
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

  t.equal(JSON.parse(res.body).errors[0].message, 'The _entities resolver tried to load an entity for type "Account", but no object type of that name was found in the schema')
})

test('buildFederationSchema function adds stub types', async (t) => {
  const schema = `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
    }

    extend type Product @key(fields: "sku") {
      sku: String
    }

    directive @customdir on FIELD_DEFINITION
  `

  const federationSchema = buildFederationSchema(schema)

  t.matchSnapshot(printSchema(federationSchema))
})
