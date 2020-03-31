'use strict'
const pmap = require('p-map')
const URL = require('url').URL
const {
  isTypeExtensionNode,
  isTypeDefinitionNode,
  parse
} = require('graphql')

const buildRequest = require('./request')

function createTypeMap (schemaDefinition) {
  const parsedSchema = parse(schemaDefinition)
  const typeMap = {}

  for (const definition of parsedSchema.definitions) {
    if (
      isTypeDefinitionNode(definition) ||
      (isTypeExtensionNode(definition) && definition.name.value === 'Query')
    ) {
      typeMap[definition.name.value] = new Set(definition.fields.map(field => field.name.value))
    }
  }

  return typeMap
}

async function buildServiceMap (services) {
  const serviceMap = {}

  for (const service of services) {
    const { name, ...opts } = service
    const { request, close } = buildRequest(opts)
    const url = new URL(opts.url)

    const serviceConfig = {
      request: function (opts) {
        return new Promise((resolve, reject) => {
          request({
            url,
            method: opts.method || 'POST',
            body: opts.body,
            headers: {
              'content-type': 'application/json',
              ...opts.headers
            }
          }, (err, response) => {
            if (err) {
              return reject(err)
            }

            if (response.statusCode === 200) {
              let data = ''
              response.stream.on('data', chunk => {
                data += chunk
              })

              response.stream.on('end', () => {
                resolve({
                  statusCode: response.statusCode,
                  json: JSON.parse(data.toString())
                })
              })
            }
          })
        })
      },
      close,
      init: async () => {
        const response = await serviceConfig.request({
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

        const typeMap = createTypeMap(schemaDefinition)

        return {
          schemaDefinition,
          typeMap
        }
      }
    }

    serviceMap[service.name] = serviceConfig
  }

  const mapper = async service => {
    const { schemaDefinition, typeMap } = await serviceMap[service.name].init()
    serviceMap[service.name].schemaDefinition = schemaDefinition
    serviceMap[service.name].typeMap = typeMap
    serviceMap[service.name].types = new Set(Object.keys(typeMap))
  }

  await pmap(services, mapper, { concurrency: 8 })

  return serviceMap
}

module.exports = buildServiceMap
