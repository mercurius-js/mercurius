'use strict'

const {
  GraphQLSchema,
  Kind,
  extendSchema,
  parse
} = require('graphql')

const BASE_FEDERATION_TYPES = `
  scalar _Any
  scalar _FieldSet

  type _Service {
    sdl: String
  }

  directive @external on FIELD_DEFINITION
  directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
  directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
  directive @key(fields: _FieldSet!) on OBJECT | INTERFACE
`

const getStubTypes = require('./get-stub-types')
const addEntitiesResolver = require('./add-entities-resolver')
const addServiceResolver = require('./add-service-resolver')

function buildFederationSchema (schema) {
  let federationSchema = new GraphQLSchema({
    query: undefined
  })

  federationSchema = extendSchema(federationSchema, parse(BASE_FEDERATION_TYPES))

  const parsedOriginalSchema = parse(schema)
  const stubTypeDefinitions = getStubTypes(parsedOriginalSchema.definitions)

  federationSchema = extendSchema(federationSchema, {
    kind: Kind.DOCUMENT,
    definitions: [
      ...stubTypeDefinitions
    ]
  })

  federationSchema = extendSchema(federationSchema, parsedOriginalSchema)

  federationSchema = addEntitiesResolver(federationSchema)
  federationSchema = addServiceResolver(federationSchema, schema)

  return new GraphQLSchema({
    ...federationSchema.toConfig(),
    query: federationSchema.getType('Query'),
    mutation: federationSchema.getType('Mutation'),
    subscription: federationSchema.getType('Subscription')
  })
}

module.exports = buildFederationSchema
