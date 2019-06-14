'use strict'

const { test } = require('tap')
const info = require('./mocks/infoBasic.json')
const fragment = require('./mocks/infoFragment.json')
const inline = require('./mocks/infoInline.json')
const { buildQueryObject, getQueryFields } = require('../queryFields')

const Fastify = require('fastify')
const GQL = require('..')

test('test getQueryFields with relationship', async (t) => {
  const result = getQueryFields(info)
  t.deepEqual(result, {
    fields: ['title'],
    relations: {
      'category': [
        'name'
      ]
    }
  })
})

test('test getQueryFields with relationship on inline fragment', async (t) => {
  const result = getQueryFields(fragment)
  t.deepEqual(result, {
    fields: ['title'],
    relations: {
      'category': [
        'name'
      ]
    }
  })
})

test('test getQueryFields with relationship on fragment', async (t) => {
  const result = getQueryFields(inline)
  t.deepEqual(result, {
    fields: ['title'],
    relations: {
      'category': [
        'name'
      ]
    }
  })
})

test('test buildQueryObject', async (t) => {
  const query = buildQueryObject(info)
  t.strictEqual(query.hasRelation('category'), true)
  t.deepEqual(query.getRelationFields('category'), 'name as category__name')
  t.deepEqual(query.getRootFields(), 'title')
})

test('test expandToGraph', async (t) => {
  const query = buildQueryObject(info)
  const graph = query.expandToGraph([{
    'category__name': 'test'
  }], ['category'])

  t.deepEqual(graph[0].category, { 'name': 'test' })
})

const dogs = [{
  name: 'Max',
  type: 'Husky'
}]

const schema = `
  type Dog {
    name: String!
    type: String!
  }
  type Query {
    dogs: [Dog]
  }
`

const query = `{
  dogs {
    name
  }
}`

test('Test resolvers', async (t) => {
  const app = Fastify()
  const resolvers = {
    Query: {
      dogs (_, params, { getQueryFields }, info) {
        const fields = getQueryFields(info)
        t.equal(fields.fields.length, 1)
        t.equal(fields.fields[0], 'name')
        return dogs
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    queryFilters: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max'
      }]
    }
  })
})
