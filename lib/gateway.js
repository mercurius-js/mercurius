'use strict'
const http = require('http')
const https = require('https')
const pump = require('pump')
const URL = require('url').URL

const { isObjectType, getNamedType, isScalarType, print, parse, isTypeDefinitionNode, Kind } = require('graphql')

const buildFederatedSchema = require('./federation')

function end (req, body, cb) {
  if (!body || typeof body === 'string' || body instanceof Uint8Array) {
    req.end(body)
  } else if (body.pipe) {
    pump(body, req, err => {
      if (err) cb(err)
    })
  } else {
    cb(new Error(`type unsupported for body: ${body.constructor}`))
  }
}

function agentOption (opts) {
  return {
    keepAlive: true,
    keepAliveMsecs: opts.keepAliveMsecs || 60 * 1000, // 1 minute
    maxSockets: opts.maxSockets || 2048,
    maxFreeSockets: opts.maxFreeSockets || 2048,
    rejectUnauthorized: opts.rejectUnauthorized
  }
}

function buildRequest (opts) {
  const agents = {
    'http:': new http.Agent(agentOption(opts)),
    'https:': new https.Agent(agentOption(opts))
  }

  const requests = {
    'http:': http,
    'https:': https
  }

  function close () {
    agents['http:'].destroy()
    agents['https:'].destroy()
  }

  function request (opts, done) {
    // console.log('sending request', opts.method, opts.url.port, opts.url.pathname, opts.url.hostname)
    const req = requests[opts.url.protocol].request({
      method: opts.method,
      port: opts.url.port,
      path: opts.url.pathname + (opts.qs || ''),
      hostname: opts.url.hostname,
      headers: opts.headers,
      agent: agents[opts.url.protocol]
    })
    req.on('error', done)
    req.on('response', res => {
      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res })
    })
    end(req, opts.body, done)
  }

  return {
    request,
    close
  }
}

function createTypeMap (schemaDefinition) {
  const parsedSchema = parse(schemaDefinition)
  const typeMap = {}

  for (const definition of parsedSchema.definitions) {
    if (isTypeDefinitionNode(definition)) {
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
          console.log('sending request', url.href, opts.body)
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

  await Promise.all(services.map(service => {
    return serviceMap[service.name].init().then(({ schemaDefinition, typeMap }) => {
      serviceMap[service.name].schemaDefinition = schemaDefinition
      serviceMap[service.name].typeMap = typeMap
      serviceMap[service.name].types = new Set(Object.keys(typeMap))
    })
  }))

  return serviceMap
}

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

function makeResolveQuery (service) {
  return function (root, args, context, info) {
    const { fieldName, returnType, operation } = info

    // Must deep-copy the operation because if we modify it (remove an item from the selection set)
    // then the resolvers for those fields won't be executed
    const currentOperation = JSON.parse(JSON.stringify(operation))
    currentOperation.selectionSet.selections[0].selectionSet.selections = currentOperation.selectionSet.selections[0].selectionSet.selections.filter(selection => service.typeMap[returnType].has(selection.name.value))

    return service.request({
      method: 'POST',
      body: JSON.stringify({
        query: print(currentOperation)
      })
    }).then(response => {
      // TODO handle GraphQL error from remote call
      return {
        __typename: returnType,
        ...response.json.data[fieldName]
      }
    })
  }
}

function makeFieldResolver (service, parentType) {
  return function (parent, args, context, info) {
    const { fieldNodes, returnType, fieldName } = info

    const type = getNamedType(returnType)

    let selections = JSON.parse(JSON.stringify(fieldNodes[0].selectionSet.selections))
    selections = selections.filter(selection => service.typeMap[type].has(selection.name.value))

    const operation = {
      kind: Kind.DOCUMENT,
      definitions: [{
        kind: Kind.OPERATION_DEFINITION,
        operation: 'query',
        name: {
          kind: Kind.NAME,
          value: 'EntitiesQuery'
        },
        variableDefinitions: [
          {
            kind: Kind.VARIABLE_DEFINITION,
            variable: {
              kind: Kind.VARIABLE,
              name: {
                kind: Kind.NAME,
                value: 'representations'
              }
            },
            type: {
              kind: Kind.NON_NULL_TYPE,
              type: {
                kind: Kind.LIST_TYPE,
                type: {
                  kind: Kind.NON_NULL_TYPE,
                  type: {
                    kind: Kind.NAMED_TYPE,
                    name: {
                      kind: Kind.NAME,
                      value: '_Any'
                    }
                  }
                }
              }
            },
            directives: []
          }
        ],
        directives: [],
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [
            {
              kind: Kind.FIELD,
              name: {
                kind: Kind.NAME,
                value: '_entities'
              },
              arguments: [
                {
                  kind: Kind.ARGUMENT,
                  name: {
                    kind: Kind.NAME,
                    value: 'representations'
                  },
                  value: {
                    kind: Kind.VARIABLE,
                    name: {
                      kind: Kind.NAME,
                      value: 'representations'
                    }
                  }
                }
              ],
              directives: [],
              selectionSet: {
                kind: Kind.SELECTION_SET,
                selections: [
                  {
                    kind: Kind.FIELD,
                    name: {
                      kind: Kind.NAME,
                      value: '__typename'
                    },
                    arguments: [],
                    directives: []
                  },
                  {
                    kind: Kind.INLINE_FRAGMENT,
                    typeCondition: {
                      kind: Kind.NAMED_TYPE,
                      name: {
                        kind: Kind.NAME,
                        value: parentType
                      }
                    },
                    directives: [],
                    selectionSet: {
                      kind: Kind.SELECTION_SET,
                      selections: [{
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: fieldName
                        },
                        directives: [],
                        selectionSet: {
                          kind: Kind.SELECTION_SET,
                          selections
                        }
                      }]
                    }
                  }
                ]
              }
            }
          ]
        }
      }
      ]
    }

    return service.request({
      method: 'POST',
      body: JSON.stringify({
        query: print(operation),
        variables: {
          representations: [parent]
        }
      })
    }).then(response => {
      // TODO handle GraphQL error from remote call
      return response.json.data._entities[0][fieldName]
    }).catch(err => {
      console.log('err', err)
    })
  }
}

function defineResolvers (schema, typeToServiceMap, serviceMap) {
  const types = schema.getTypeMap()

  for (const type of Object.values(types)) {
    if (isObjectType(type) && !isDefaultType(type.name)) {
      const serviceForType = typeToServiceMap[type.name]

      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type)
        if (!isScalarType(fieldType)) {
          const serviceForFieldType = typeToServiceMap[fieldType]

          if (serviceForFieldType !== serviceForType) {
            if (serviceForType === null) {
              field.resolve = makeResolveQuery(serviceMap[serviceForFieldType])
            } else {
              field.resolve = makeFieldResolver(serviceMap[serviceForFieldType], type)
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
