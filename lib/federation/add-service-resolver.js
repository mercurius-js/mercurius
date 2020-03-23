'use strict'

const { extendSchema, parse } = require('graphql')

function addServiceResolver (schema, originalSchemaSDL) {
  schema = extendSchema(schema, parse(`
    extend type Query {
      _service: _Service!
    }
  `), {
    assumeValid: true
  })
  const query = schema.getType('Query')

  const queryFields = query.getFields()
  queryFields._service = {
    ...queryFields._service,
    resolve: () => ({ sdl: originalSchemaSDL })
  }

  return schema
}

module.exports = addServiceResolver
