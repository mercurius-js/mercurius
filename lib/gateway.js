'use strict'

const {
  getNamedType,
  isObjectType,
  isScalarType
} = require('graphql')
const buildFederatedSchema = require('./federation')
const buildServiceMap = require('./gateway/service-map')
const {
  makeResolver,
  createQueryOperation,
  createFieldResolverOperation,
  createEntityReferenceResolverOperation
} = require('./gateway/make-resolver')

function isDefaultType (type) {
  return [
    '__Schema',
    '__Type',
    '__Field',
    '__InputValue',
    '__EnumValue',
    '__Directive'
  ].includes(type)
}

/**
 * The gateway resolver methods are responsible to delegate certain parts of the query to a service.
 *
 * For every type in the schema - defined by services - it checks each field to decide what kind of resolver it needs.
 * This is done by getting the service name of the current type and comparing it to the return type of the field when
 * it is not a Scalar type (Scalar type fields do not need resolvers). Only when the two services are not the same it is
 * needed to add a resolver function for the field.
 *
 * There are 3 options:
 *  - Query field resolver: when the service of the type is null
 *  - Reference entity resolver: when the service of type defined the field on the type
 *  - Field entity resolver: when the field was added through type extension in the service of the field's type
 *
 * Example
 *
 * Service 1
 *
 * extend Query {
 *   # assign query field resolver
 *   me: User
 * }
 *
 * type User @key(fields: "id") {
 *   id: ID!
 *   name: String
 * }
 *
 * Service 2
 *
 * type Post @key(fields: "id") {
 *   id: ID!
 *   title: String
 *   content: String
 *   # assign reference entity field resolver
 *   author: User
 * }
 *
 * extend type User @key(fields: "id") {
 *   id: ID! @external
 *   # assign field entity resolver
 *   posts: [Post]
 * }
 */
function defineResolvers (schema, typeToServiceMap, serviceMap) {
  const types = schema.getTypeMap()

  for (const type of Object.values(types)) {
    if (isObjectType(type) && !isDefaultType(type.name)) {
      const serviceForType = typeToServiceMap[type.name]

      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type)
        const fieldName = field.name
        if (!isScalarType(fieldType)) {
          const serviceForFieldType = typeToServiceMap[fieldType]

          if (serviceForFieldType !== serviceForType) {
            if (serviceForType === null) {
              field.resolve = makeResolver({
                service: serviceMap[serviceForFieldType],
                createOperation: createQueryOperation,
                transformData: response => response.json.data[fieldName],
                isQuery: true
              })
            } else {
              // check if the field is default field of the type
              if (serviceMap[serviceForType].typeMap[type.name].has(fieldName)) {
                field.resolve = makeResolver({
                  service: serviceMap[serviceForFieldType],
                  createOperation: createEntityReferenceResolverOperation,
                  transformData: response => response.json.data._entities[0],
                  isReference: true
                })
              } else {
                field.resolve = makeResolver({
                  service: serviceMap[serviceForFieldType],
                  createOperation: createFieldResolverOperation,
                  transformData: response => response.json.data._entities[0][fieldName]
                })
              }
            }
          }
        }
      }
    }
  }
}

async function buildGateway (gatewayOpts) {
  const { services } = gatewayOpts

  const serviceMap = await buildServiceMap(services)

  const serviceSDLs = Object.values(serviceMap).map(service => service.schemaDefinition)

  const schema = buildFederatedSchema(serviceSDLs.join(''), true)

  const typeToServiceMap = {}
  for (const [service, serviceDefinition] of Object.entries(serviceMap)) {
    for (const type of serviceDefinition.types) {
      typeToServiceMap[type] = service
    }
  }
  typeToServiceMap.Query = null
  typeToServiceMap.Mutation = null

  defineResolvers(schema, typeToServiceMap, serviceMap)

  return {
    schema,
    serviceMap,
    close () {
      for (const service of Object.values(serviceMap)) {
        service.close()
      }
    }
  }
}

module.exports = buildGateway
