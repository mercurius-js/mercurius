'use strict'
const pmap = require('p-map')
const eos = require('end-of-stream')
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
      const fieldsOfType = new Set()
      if (definition.fields) {
        for (const field of definition.fields) {
          fieldsOfType.add(field.name.value)
        }
      }

      typeMap[definition.name.value] = fieldsOfType
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
      sendRequest: function (opts) {
        return new Promise((resolve, reject) => {
          request({
            url,
            method: opts.method,
            body: opts.body,
            headers: {
              'content-type': 'application/json',
              'content-length': opts.body.length,
              ...opts.headers
            }
          }, (err, response) => {
            if (err) {
              return reject(err)
            }

            let data = ''
            response.stream.on('data', chunk => {
              data += chunk
            })

            eos(response.stream, (err) => {
              if (err) {
                return reject(err)
              }

              try {
                const json = JSON.parse(data.toString())
                resolve({
                  statusCode: response.statusCode,
                  json
                })
              } catch (e) {
                reject(e)
              }
            })
          })
        })
      },
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
