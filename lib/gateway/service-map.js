'use strict'
const pmap = require('p-map')
const URL = require('url').URL
const {
  isTypeExtensionNode,
  isTypeDefinitionNode,
  parse
} = require('graphql')

const { buildRequest, sendRequest } = require('./request')
const SubscriptionClient = require('../subscription-client')

function hasDirective (directiveName, node) {
  const { directives = [] } = node
  return directives.some(directive => directive.name.value === directiveName)
}

function createFieldSet (existingSet, definition, filterFn = () => false) {
  const fieldsSet = existingSet || new Set()

  if (definition.fields) {
    for (const field of definition.fields) {
      if (!filterFn(field)) {
        fieldsSet.add(field.name.value)
      }
    }
  }

  return fieldsSet
}

function createTypeMap (schemaDefinition) {
  const parsedSchema = parse(schemaDefinition)
  const typeMap = {}
  const types = new Set()
  const extensionTypeMap = {}

  for (const definition of parsedSchema.definitions) {
    const isTypeExtensionByDirective = hasDirective('extends', definition)
    /* istanbul ignore else we are only interested in type definition and type extension scenarios */
    if (isTypeDefinitionNode(definition) && !isTypeExtensionByDirective) {
      typeMap[definition.name.value] = createFieldSet(typeMap[definition.name.value], definition)
      types.add(definition.name.value)
    } else if (isTypeExtensionNode(definition) || isTypeExtensionByDirective) {
      typeMap[definition.name.value] = createFieldSet(typeMap[definition.name.value], definition)
      extensionTypeMap[definition.name.value] = createFieldSet(extensionTypeMap[definition.name.value], definition, hasDirective.bind(null, 'external'))
    }
  }

  return { typeMap, types, extensionTypeMap }
}

async function getWsOpts (service) {
  let opts = {
    serviceName: service.name
  }
  if (typeof service.wsConnectionParams === 'object') {
    opts = { ...opts, ...service.wsConnectionParams }
  } else if (typeof service.wsConnectionParams === 'function') {
    opts = { ...opts, ...(await service.wsConnectionParams()) }
  }

  return opts
}

async function buildServiceMap (services) {
  const serviceMap = {}

  for (const service of services) {
    const { name, mandatory = false, ...opts } = service
    const { request, close } = buildRequest(opts)
    const url = new URL(opts.url)

    const serviceConfig = {
      mandatory: mandatory,
      sendRequest: sendRequest(request, url),
      close,
      async refresh () {
        const { schemaDefinition, typeMap, types, extensionTypeMap } = await serviceConfig.init()

        serviceConfig.schemaDefinition = schemaDefinition
        serviceConfig.typeMap = typeMap
        serviceConfig.types = types
        serviceConfig.extensionTypeMap = extensionTypeMap

        return serviceConfig
      },
      async reconnectSubscription () {
        if (serviceConfig.client) {
          serviceConfig.client.close()

          const wsOpts = await getWsOpts(service)
          const client = new SubscriptionClient(service.wsUrl, wsOpts)

          serviceConfig.client = client
          serviceConfig.createSubscription = client.createSubscription.bind(
            client
          )
        }
      },
      async init () {
        const response = await serviceConfig.sendRequest({
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

        const {
          json: { data = null, error, message, statusCode }
        } = response

        if (data === null) {
          throw Object.assign(new Error(), { error, message, statusCode })
        }

        const schemaDefinition = data._service.sdl

        const { typeMap, types, extensionTypeMap } = createTypeMap(schemaDefinition)

        return {
          schemaDefinition,
          typeMap,
          types,
          extensionTypeMap
        }
      }
    }

    if (service.wsUrl) {
      const wsOpts = await getWsOpts(service)
      const client = new SubscriptionClient(service.wsUrl, wsOpts)

      serviceConfig.client = client
      serviceConfig.createSubscription = client.createSubscription.bind(client)
    }

    serviceMap[service.name] = serviceConfig
  }

  const mapper = async service => {
    const { schemaDefinition, typeMap, types, extensionTypeMap } = await serviceMap[service.name].init()
    serviceMap[service.name].schemaDefinition = schemaDefinition
    serviceMap[service.name].typeMap = typeMap
    serviceMap[service.name].types = types
    serviceMap[service.name].extensionTypeMap = extensionTypeMap
    serviceMap[service.name].name = service.name
  }

  await pmap(services, mapper, { concurrency: 8 })

  return serviceMap
}

module.exports = buildServiceMap
