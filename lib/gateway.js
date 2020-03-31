'use strict'

const {
  getNamedType,
  isObjectType,
  isScalarType
} = require('graphql')
const buildFederatedSchema = require('./federation')
const buildServiceMap = require('./gateway/service-map')
const {
  makeFieldResolver,
  makeReferenceResolver,
  makeQueryResolver
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
              field.resolve = makeQueryResolver(serviceMap[serviceForFieldType])
            } else {
              // check if the field is default field of the type
              if (serviceMap[serviceForType].typeMap[type.name].has(fieldName)) {
                field.resolve = makeReferenceResolver(serviceMap[serviceForFieldType])
              } else {
                field.resolve = makeFieldResolver(serviceMap[serviceForFieldType], type)
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

  defineResolvers(schema, typeToServiceMap, serviceMap)

  return {
    schema,
    serviceMap
  }
}

module.exports = buildGateway
