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
const { MER_ERR_GQL_GATEWAY_INIT } = require('../errors')

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

async function getRemoteSchemaDefinition (serviceConfig, initHeaders) {
  let headers
  if (typeof initHeaders === 'function') {
    headers = await initHeaders()
  } else if (typeof initHeaders === 'object') {
    headers = initHeaders
  }

    const response = await serviceConfig.sendRequest({
      body: JSON.stringify({
        query: `
              query ServiceInfo {
                _service {
                  sdl
                }
              }
              `
      }),
      headers
    })

    const {
      json: { data = null, error, message, statusCode }
    } = response

    if (data === null) {
      const err = new MER_ERR_GQL_GATEWAY_INIT()
      err.error = error
      err.message = message
      err.statusCode = statusCode

      throw err
    }

    return data._service.sdl
}

async function buildServiceMap (services, errorHandler) {
  const serviceMap = {}

  for (const service of services) {
    const { name, mandatory = false, initHeaders, ...opts } = service
    const { request, close } = buildRequest(opts)
    const url = new URL(opts.url)

    const serviceConfig = {
      mandatory: mandatory,
      sendRequest: sendRequest(request, url),
      close,
      async refresh () {
        // if this is using a supplied schema refresh is done manually with setSchema
        if (opts.schema) {
          return serviceConfig
        }

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
        const schemaDefinition = opts.schema || await getRemoteSchemaDefinition(serviceConfig, initHeaders)

        const { typeMap, types, extensionTypeMap } = createTypeMap(schemaDefinition)

        return {
          schemaDefinition,
          typeMap,
          types,
          extensionTypeMap
        }
      },
      setSchema(schema) {
        if (serviceConfig.schemaDefinition === schema) {
          return serviceConfig;
        }
        
        const { typeMap, types, extensionTypeMap } = createTypeMap(schema)

        serviceConfig.schemaDefinition = schema
        serviceConfig.typeMap = typeMap
        serviceConfig.types = types
        serviceConfig.extensionTypeMap = extensionTypeMap

        return serviceConfig;
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
    const serviceConfig = await serviceMap[service.name].init()
      .catch((err) => {
        errorHandler(err, service)
      })

    if (serviceConfig) {
      serviceMap[service.name].schemaDefinition = serviceConfig.schemaDefinition
      serviceMap[service.name].typeMap = serviceConfig.typeMap
      serviceMap[service.name].types = serviceConfig.types
      serviceMap[service.name].extensionTypeMap = serviceConfig.extensionTypeMap
    } else {
      serviceMap[service.name].schemaDefinition = ''
      serviceMap[service.name].typeMap = {}
      serviceMap[service.name].types = new Set()
      serviceMap[service.name].extensionTypeMap = {}
    }

    serviceMap[service.name].name = service.name
  }

  await pmap(services, mapper, { concurrency: 8 })

  return serviceMap
}

module.exports = buildServiceMap
