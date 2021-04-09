'use strict'

const {
  getNamedType,
  isObjectType,
  isScalarType,
  Kind,
  parse
} = require('graphql')
const { Factory } = require('single-user-cache')
const buildFederatedSchema = require('./federation')
const buildServiceMap = require('./gateway/service-map')
const {
  makeResolver,
  createQueryOperation,
  createFieldResolverOperation,
  createEntityReferenceResolverOperation,
  kEntityResolvers
} = require('./gateway/make-resolver')
const { MER_ERR_GQL_GATEWAY_REFRESH, MER_ERR_GQL_GATEWAY_INIT } = require('./errors')
const { preGatewayExecutionHandler } = require('./handlers')

const allSettled = require('promise.allsettled')

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
function defineResolvers (schema, typeToServiceMap, serviceMap, typeFieldsToService) {
  const types = schema.getTypeMap()

  for (const type of Object.values(types)) {
    if (isObjectType(type) && !isDefaultType(type.name)) {
      const serviceForType = typeToServiceMap[type.name]

      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type)
        if (fieldType.astNode && fieldType.astNode.kind === Kind.ENUM_TYPE_DEFINITION) continue
        const fieldName = field.name
        if (!isScalarType(fieldType)) {
          const serviceForFieldType = typeToServiceMap[fieldType]

          if (serviceForFieldType !== serviceForType) {
            if (serviceForType === null) {
              // Either query, mutation, subscription
              if (type.name === 'Subscription') {
                field.subscribe = makeResolver({
                  service: serviceMap[serviceForFieldType],
                  createOperation: createQueryOperation,
                  isQuery: true,
                  isSubscription: true
                })
              } else {
                field.resolve = makeResolver({
                  service: serviceMap[serviceForFieldType],
                  createOperation: createQueryOperation,
                  transformData: response => response.json.data[fieldName],
                  isQuery: true
                })
              }
            } else if (!fieldType.astNode || fieldType.astNode.kind !== Kind.INTERFACE_TYPE_DEFINITION) {
              // check if the field is default field of the type
              if (serviceMap[serviceForType].typeMap[type.name].has(fieldName)) {
                // Check if field is nullable
                const isNonNull = field.astNode.type.kind === Kind.NON_NULL_TYPE
                const leafKind = isNonNull ? field.astNode.type.type.kind : field.astNode.type.kind

                if (leafKind === Kind.LIST_TYPE) {
                  field.resolve = makeResolver({
                    service: serviceMap[serviceForFieldType],
                    createOperation: createEntityReferenceResolverOperation,
                    transformData: response => response ? response.json.data._entities : (isNonNull ? [] : null),
                    isReference: true
                  })
                } else {
                  field.resolve = makeResolver({
                    service: serviceMap[serviceForFieldType],
                    createOperation: createEntityReferenceResolverOperation,
                    transformData: response => response.json.data._entities[0],
                    isReference: true
                  })
                }
              } else {
                field.resolve = makeResolver({
                  service: serviceMap[serviceForFieldType],
                  createOperation: createFieldResolverOperation,
                  transformData: response => response.json.data._entities[0][fieldName]
                })
              }
            }
          } else {
            field.resolve = (parent, args, context, info) => parent && parent[info.path.key]
          }
        } else if (typeFieldsToService[`${type}-${fieldName}`]) {
          const service = serviceMap[typeFieldsToService[`${type}-${fieldName}`]]
          if (serviceForType === null) {
            field.resolve = makeResolver({
              service,
              createOperation: createQueryOperation,
              transformData: response => response.json.data[fieldName],
              isQuery: true
            })
          } else {
            field.resolve = makeResolver({
              service,
              createOperation: createFieldResolverOperation,
              transformData: response => response.json.data._entities[0][fieldName]
            })
          }
        } else {
          field.resolve = (parent, args, context, info) => parent && parent[info.path.key]
        }
      }
    }
  }
}

function defaultErrorHandler (error, service) {
  if (service.mandatory) {
    throw error
  }
}

async function buildGateway (gatewayOpts, app) {
  const { services, errorHandler = defaultErrorHandler } = gatewayOpts

  const serviceMap = await buildServiceMap(services, errorHandler)

  const serviceSDLs = Object.entries(serviceMap).reduce((acc, [name, value]) => {
    const { schemaDefinition, error } = value

    error !== null
      ? app.log.warn(`Initializing service "${name}" failed with message: "${error.message}"`)
      : acc.push(schemaDefinition)

    return acc
  }, [])

  if (serviceSDLs.length < 1) {
    throw new MER_ERR_GQL_GATEWAY_INIT('No valid service SDLs were provided')
  }

  const schema = buildFederatedSchema(serviceSDLs.join(''), true)

  const typeToServiceMap = {}
  const typeFieldsToService = {}
  const factory = new Factory()
  app.decorateReply(kEntityResolvers)
  app.addHook('onRequest', async function (req, reply) {
    reply[kEntityResolvers] = factory.create()
  })

  for (const [service, serviceDefinition] of Object.entries(serviceMap)) {
    for (const type of serviceDefinition.types) {
      typeToServiceMap[type] = service
    }

    for (const [type, fields] of Object.entries(serviceDefinition.extensionTypeMap)) {
      for (const field of fields) {
        typeFieldsToService[`${type}-${field}`] = service
      }
    }

    /**
     * TODO: further optimization is possible by merging queries to the same service
     * when the entities query is for the same type with the same representation values
     * but for different fields
     *
     * This example currently sends 2 requests:
     * [{
     *   query: `query EntitiesQuery($representations: [_Any!]!) {
     *     _entities(representations: $representations) {
     *        __typename
     *        ... on Product {
     *          inStock
     *        }
     *     }
     *   }`,
     *   variables: {
     *     representations: [{ __typename: "Product", upc: "1"}, {__typename:"Product", upc:"2"}]
     *   }
     * }, {
     *   query: `query EntitiesQuery($representations: [_Any!]!) {
     *     _entities(representations: $representations) {
     *        __typename
     *        ... on Product {
     *          inStock
     *        }
     *     }
     *   }`,
     *   variables: {
     *     representations: [{ __typename: "Product", upc: "1"}, {__typename:"Product", upc:"2"}]
     *   }
     * }]
     *
     * but queries should be merged into one and only one service request should be made
     *
     * {
     *   query: `query EntitiesQuery($representations: [_Any!]!) {
     *     _entities(representations: $representations) {
     *        __typename
     *        ... on Product {
     *          inStock
     *          shippingEstimate
     *        }
     *     }
     *   }`,
     *   variables: {
     *     representations: [{ __typename: "Product", upc: "1"}, {__typename:"Product", upc:"2"}]
     *   }
     * }
     *
     * However returning the correct response for the two orignal query is not trival hence it remains a future todo
     *
     */
    factory.add(`${service}Entity`, async (queries) => {
      const q = [...new Set(queries.map(q => q.query))]

      const resultIndexes = []
      let queryIndex = 0
      const mergedQueries = queries.reduce((acc, curr) => {
        if (!acc[curr.query]) {
          acc[curr.query] = curr.variables
          resultIndexes[q.indexOf(curr.query)] = []
        } else {
          acc[curr.query].representations = [
            ...acc[curr.query].representations,
            ...curr.variables.representations
          ]
        }

        for (let i = 0; i < curr.variables.representations.length; i++) {
          resultIndexes[q.indexOf(curr.query)].push(queryIndex)
        }

        queryIndex++

        return acc
      }, {})

      const result = []

      // Gateway query here
      await Promise.all(Object.entries(mergedQueries).map(async ([query, variables], queryIndex, entries) => {
        // Trigger preGatewayExecution hook for entities
        let modifiedQuery
        if (queries[queryIndex].context.preGatewayExecution !== null) {
          ({ modifiedQuery } = await preGatewayExecutionHandler({
            schema: serviceDefinition.schema,
            document: parse(query),
            context: queries[queryIndex].context,
            service: { name: service }
          }))
        }

        const response = await serviceDefinition.sendRequest({
          originalRequestHeaders: queries[queryIndex].originalRequestHeaders,
          body: JSON.stringify({
            query: modifiedQuery || query,
            variables
          }),
          context: queries[queryIndex].context
        })

        let entityIndex = 0
        for (const entity of response.json.data._entities) {
          if (!result[resultIndexes[queryIndex][entityIndex]]) {
            result[resultIndexes[queryIndex][entityIndex]] = {
              ...response,
              json: {
                data: {
                  _entities: [entity]
                }
              }
            }
          } else {
            result[resultIndexes[queryIndex][entityIndex]].json.data._entities.push(entity)
          }

          entityIndex++
        }
      }))

      return result
    }, query => query.id)
  }

  typeToServiceMap.Query = null
  typeToServiceMap.Mutation = null
  typeToServiceMap.Subscription = null

  defineResolvers(schema, typeToServiceMap, serviceMap, typeFieldsToService)

  return {
    schema,
    serviceMap,
    entityResolversFactory: factory,
    pollingInterval: gatewayOpts.pollingInterval,
    async refresh () {
      if (this._serviceSDLs === undefined) {
        this._serviceSDLs = serviceSDLs.join('')
      }

      const $refreshResult = await allSettled(
        Object.values(serviceMap).map((service) =>
          service.refresh().catch((err) => {
            errorHandler(err, service)
          })
        )
      )

      const rejectedResults = $refreshResult
        .filter(({ status }) => status === 'rejected')
        .map(({ reason }) => reason)

      if (rejectedResults.length) {
        const err = new MER_ERR_GQL_GATEWAY_REFRESH()
        err.errors = rejectedResults
        throw err
      }

      const _serviceSDLs = Object.values(serviceMap)
        .map((service) => service.schemaDefinition)
        .join('')

      if (this._serviceSDLs === _serviceSDLs) {
        return null
      }

      this._serviceSDLs = _serviceSDLs

      for (const [service, serviceDefinition] of Object.entries(serviceMap)) {
        for (const type of serviceDefinition.types) {
          typeToServiceMap[type] = service
        }

        for (const [type, fields] of Object.entries(serviceDefinition.extensionTypeMap)) {
          for (const field of fields) {
            typeFieldsToService[`${type}-${field}`] = service
          }
        }
      }

      await allSettled(
        Object.values(serviceMap).map((service) =>
          service.reconnectSubscription()
        )
      )

      const schema = buildFederatedSchema(_serviceSDLs, true)

      typeToServiceMap.Query = null
      typeToServiceMap.Mutation = null
      typeToServiceMap.Subscription = null

      defineResolvers(schema, typeToServiceMap, serviceMap, typeFieldsToService)

      return schema
    },
    close () {
      for (const service of Object.values(serviceMap)) {
        service.close()
      }
    }
  }
}

module.exports = buildGateway
