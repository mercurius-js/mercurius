'use strict'
const pmap = require('p-map')
const URL = require('url').URL
const WebSocket = require('ws')
const {
  isTypeExtensionNode,
  isTypeDefinitionNode,
  parse
} = require('graphql')

const { buildRequest, sendRequest } = require('./request')

function hasExternalDirective (field) {
  return field.directives.some(directive => directive.name.value === 'external')
}

function createFieldSet (definition, filterFn = () => false) {
  const fieldsSet = new Set()

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
    /* istanbul ignore else we are only interested in type definition and type extension scenarios */
    if (isTypeDefinitionNode(definition)) {
      typeMap[definition.name.value] = createFieldSet(definition)
      types.add(definition.name.value)
    } else if (isTypeExtensionNode(definition)) {
      typeMap[definition.name.value] = createFieldSet(definition)
      extensionTypeMap[definition.name.value] = createFieldSet(definition, hasExternalDirective)
    }
  }

  return { typeMap, types, extensionTypeMap }
}

async function buildServiceMap (services, subscriber) {
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
      const ws = new WebSocket(service.wsUrl, 'graphql-ws')
      const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
      client.setEncoding('utf8')
      client.write(JSON.stringify({
        type: 'connection_init'
      }))
      client.on('data', async (chunk) => {
        const data = JSON.parse(chunk)
        if (data.type === 'data') {
          await subscriber.publish({
            topic: `${service.name}_${data.id}`,
            payload: data.payload.data
          })
        }
      })
      client.on('error', (e) => {
        // TODO add proper error handling
        console.log('PANIC some error', e)
        throw e
      })
      ws.on('close', () => {
        console.log('ws close')
        client.end()
      })

      serviceConfig.subscriptionQueryMap = new Set()
      serviceConfig.createSubscription = (query, args = {}) => {
        // TODO find a better way to generate unique id base on query and args
        const id = (query + '_' + JSON.stringify(args)).replace(/\s/gi, '') // cannot contain spaces because then it fails don't know why

        if (serviceConfig.subscriptionQueryMap.has(id)) {
          return id
        }

        client.write(JSON.stringify({
          id,
          type: 'start',
          payload: {
            query,
            variables: args
          }
        }))

        serviceConfig.subscriptionQueryMap.add(id)

        return id
      }
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
