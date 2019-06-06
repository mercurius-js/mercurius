'use strict'

const { test } = require('tap')
const info = require('./mocks/infoBasic.json')
const { buildQueryObject, getQueryFields } = require('../queryFields')

test('test getQueryFields with relationships', async (t) => {
  const result = getQueryFields(info)
  t.deepEqual(result, {
    fields: ['name'],
    relations: {
      'mother': [
        'name'
      ]
    }
  })
})

test('test buildQueryObject', async (t) => {
  const query = buildQueryObject(info)
  t.strictEqual(query.hasRelation('mother'), true)
  t.deepEqual(query.getRelationFields('mother'), '"name"')
  t.deepEqual(query.getRootFields(), '"name"')
})
