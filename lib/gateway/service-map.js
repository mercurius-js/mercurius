'use strict'
const pmap = require('p-map')
const URL = require('url').URL
const {
  isTypeExtensionNode,
  isTypeDefinitionNode,
  parse
} = require('graphql')

const { buildRequest, sendRequest } = require('./request')

function createFieldSet (definition) {
  const fieldsSet = new Set()

  if (definition.fields) {
    for (const field of definition.fields) {
      fieldsSet.add(field.name.value)
    }
  }

  return fieldsSet
}

function createTypeMap (schemaDefinition) {
  const parsedSchema = parse(schemaDefinition)
  const typeMap = {}
  const types = new Set()

  for (const definition of parsedSchema.definitions) {
    /* istanbul ignore else we are only interested in type definition and type extension scenarios */
    if (isTypeDefinitionNode(definition)) {
      typeMap[definition.name.value] = createFieldSet(definition)
      types.add(definition.name.value)
    } else if (isTypeExtensionNode(definition)) {
      typeMap[definition.name.value] = createFieldSet(definition)
    }
  }

  return { typeMap, types }
}

async function buildServiceMap (services) {
  const serviceMap = {}

  for (const service of services) {
    const { name, ...opts } = service
    const { request, close } = buildRequest(opts)
    const url = new URL(opts.url)

    const serviceConfig = {
      sendRequest: sendRequest(request, url),
      close,
      async init () {
        const response = await serviceConfig.sendRequest({
          method: 'POST',
          body: JSON.stringify({
            query: `
            query ServiceInfo {
              _service {
                sdl
              }
            }
            `
          })
        })

        const schemaDefinition = response.json.data._service.sdl

        const { typeMap, types } = createTypeMap(schemaDefinition)

        return {
          schemaDefinition,
          typeMap,
          types
        }
      }
    }

    serviceMap[service.name] = serviceConfig
  }

  const mapper = async service => {
    const { schemaDefinition, typeMap, types } = await serviceMap[service.name].init()
    serviceMap[service.name].schemaDefinition = schemaDefinition
    serviceMap[service.name].typeMap = typeMap
    serviceMap[service.name].types = types
  }

  await pmap(services, mapper, { concurrency: 8 })

  return serviceMap
}

module.exports = buildServiceMap
