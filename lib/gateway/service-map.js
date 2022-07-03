'use strict'
const pmap = require('p-map')
const URL = require('url').URL
const {
  isTypeExtensionNode,
  isTypeDefinitionNode,
  parse,
  buildSchema,
  GraphQLSchema,
  GraphQLError
} = require('graphql')

const { buildRequest, sendRequest } = require('./request')
const SubscriptionClient = require('../subscription-client')
const { MER_ERR_GQL_GATEWAY_INIT } = require('../errors')
const buildFederationSchema = require('../federation')
const { hasDirective, hasExtensionDirective } = require('../util')

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
    const isTypeExtensionByDirective = hasExtensionDirective(definition)
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
    serviceName: service.name,
    keepAlive: service.keepAlive
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

function safeBuildSchema (schemaDefinition) {
  try {
    return buildSchema(schemaDefinition)
  } catch {
    return buildFederationSchema(schemaDefinition)
  }
}

async function buildServiceMap (services, errorHandler, log) {
  const serviceMap = {}

  for (const service of services) {
    const { name, mandatory = false, initHeaders, useSecureParse = false, ...opts } = service
    const { request, close } = buildRequest(opts)
    const url = new URL(Array.isArray(opts.url) ? opts.url[0] : opts.url)

    const serviceConfig = {
      mandatory,
      sendRequest: sendRequest(request, url, useSecureParse),
      setResponseHeaders: (reply) => opts.setResponseHeaders ? opts.setResponseHeaders(reply) : null,
      close,
      async refresh () {
        // if this is using a supplied schema refresh is done manually with setSchema
        if (opts.schema) {
          return serviceConfig
        }

        const { schema, schemaDefinition, typeMap, types, extensionTypeMap } = await serviceConfig.init()

        serviceConfig.schema = schema
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
        const schema = safeBuildSchema(schemaDefinition)

        return {
          schema,
          schemaDefinition,
          typeMap,
          types,
          extensionTypeMap
        }
      },
      setSchema (schemaDefinition) {
        if (serviceConfig.schemaDefinition === schemaDefinition) {
          return serviceConfig
        }

        const { typeMap, types, extensionTypeMap } = createTypeMap(schemaDefinition)
        const schema = safeBuildSchema(schemaDefinition)

        serviceConfig.schema = schema
        serviceConfig.schemaDefinition = schemaDefinition
        serviceConfig.typeMap = typeMap
        serviceConfig.types = types
        serviceConfig.extensionTypeMap = extensionTypeMap

        return serviceConfig
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
    let serviceConfig
    let serviceConfigErr

    try {
      serviceConfig = await serviceMap[service.name].init()
    } catch (err) {
      serviceConfigErr = err
      if (!service.mandatory || err instanceof GraphQLError) {
        log.warn(`Initializing service "${service.name}" failed with message: "${err.message}"`)
        errorHandler(err, service)
      }
    }

    if (serviceConfig) {
      serviceMap[service.name].schema = serviceConfig.schema
      serviceMap[service.name].schemaDefinition = serviceConfig.schemaDefinition
      serviceMap[service.name].typeMap = serviceConfig.typeMap
      serviceMap[service.name].types = serviceConfig.types
      serviceMap[service.name].extensionTypeMap = serviceConfig.extensionTypeMap
      serviceMap[service.name].error = null
    } else {
      serviceMap[service.name].schema = new GraphQLSchema({})
      serviceMap[service.name].schemaDefinition = ''
      serviceMap[service.name].typeMap = {}
      serviceMap[service.name].types = new Set()
      serviceMap[service.name].extensionTypeMap = {}
      serviceMap[service.name].error = serviceConfigErr
    }

    serviceMap[service.name].name = service.name
    serviceMap[service.name].allowBatchedQueries = service.allowBatchedQueries
  }

  await pmap(services, mapper, { concurrency: 8 })

  return serviceMap
}

module.exports = buildServiceMap
