'use strict'

const { test } = require('tap')
const info = require('./mocks/infoBasic.json')
const fragment = require('./mocks/infoFragment.json')
const inline = require('./mocks/infoInline.json')
const { buildQueryObject, getQueryFields } = require('../queryFields')

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
  t.deepEqual(query.getRelationFields('category'), '"name" as "category__name"')
  t.deepEqual(query.getRootFields(), '"title"')
})

test('test expandToGraph', async (t) => {
  const query = buildQueryObject(info)
  const graph = query.expandToGraph([{
    'category__name': 'test'
  }], ['category'])

  t.deepEqual(graph[0].category, { 'name': 'test' })
})
