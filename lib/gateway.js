'use strict'

const {
  getNamedType,
  isObjectType,
  isScalarType,
  Kind
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
const { MER_ERR_GQL_GATEWAY_REFRESH, MER_ERR_GQL_GATEWAY_INIT, MER_ERR_SERVICE_RETRY_FAILED } = require('./errors')
const findValueTypes = require('./gateway/find-value-types')
const getQueryResult = require('./gateway/get-query-result')

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
 * For each type in the schema defined by the services, it checks each field to decide if it needs a resolver and if so,
 * what kind of resolver. This is done by getting the current type, its service name (if defined) and the service name
 * of the field type (if defined). The respective services can be undefined if the field type is a value type or the
 * type is query, mutation or subscription.
 *
 * While derivation logic is documented inline, the following example shall provide an overview.
 *
 *
 * Service 1 (User Service)
 *
 * extend Query {
 *   # assign query field resolver to retrieve the user from user service
 *   me: User!
 *   # assign query field resolver to retrieve the user connection from user service
 *   users: UserConnection!
 *   # assign a query field resolver to retrieve the service info (which is a value type) from the user service
 *   userServiceInfo: ServiceInfo!
 * }
 *
 * type ServiceInfo {
 *   name: String!
 * }
 *
 * type UserConnection {
 *   # PageInfo is defined in both services, hence a value type, and resolved from the parent
 *   pageInfo: PageInfo!
 *   edges: [UserEdge!]!
 * }
 *
 * type PageInfo {
 *   hasNextPage: Boolean
 * }
 *
 * type UserEdge {
 *   node: User!
 * }
 *
 * type User @key(fields: "id") {
 *   id: ID!
 *   name: String
 * }
 *
 *
 * Service 2 (Post Service)
 *
 * extend type Query {
 *   # assign query field resolver to retrieve posts from post service
 *   posts: PostConnection!
 *   # assign a query field resolver to retrieve the service info (which is a value type) from the post service
 *   postServiceInfo: ServiceInfo!
 * }
 *
 * type ServiceInfo {
 *   name: String!
 * }
 *
 * type PostConnection {
 *   # PageInfo is defined in both services, hence a value type, and resolved from the parent
 *   pageInfo: PageInfo!
 *   edges: [PostEdge!]!
 * }
 *
 * type PageInfo {
 *   hasNextPage: Boolean
 * }
 *
 * type PostEdge {
 *   node: Post!
 * }
 *
 * type Post @key(fields: "id") {
 *   id: ID!
 *   title: String
 *   content: String
 *   # assign reference entity field resolver to retrieve author from user service
 *   author: User
 * }
 *
 * extend type User @key(fields: "id") {
 *   id: ID! @external
 *   # assign field entity resolver to enable querying posts of a user from the post service
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
          /* istanbul ignore else */
          if (
            (serviceForFieldType === null && serviceForType !== null) ||
            (serviceForFieldType !== null && serviceForType !== null && serviceForFieldType === serviceForType)
          ) {
            /**
             * We resolve from the parent in two cases:
             * - Either there is a service for the type and no service for the field type.
             *   In this case, the field type is a value type and the type is neither a query, mutation nor a subscription.
             * - Or there is a service for the type and a service for the field type and both refer to the same service.
             */
            field.resolve = (parent, args, context, info) => parent && parent[info.path.key]
          } else if (serviceForType === null) {
            /**
              *  If the return type of a query, subscription or mutation is a value type, its service is undefined or null, e.g. for
              *  extend type Query {
              *     userServiceInfo: SomeReturnType!
              *  }
              *  where SomeReturnType is a value type.
              *  In these cases, we get the service from the typeFieldsToService map.
              */
            let service = serviceMap[typeFieldsToService[`${type}-${fieldName}`]]
            if (!service && (type.name === 'Query' || type.name === 'Mutation' || type.name === 'Subscription')) {
              /**
               * If there is no service for the type, it is a query, mutation or subscription
               */
              service = serviceMap[serviceForFieldType]
            }
            if (!service) {
              service = serviceMap[serviceForFieldType]

              if (!service) {
                /**
                 * If the type is a nested value type, the service can still be null or undefined.
                 * In these cases, we resolve from the parent.
                 */
                field.resolve = (parent, args, context, info) => parent && parent[info.path.key]
              } else {
                // If the service is not null, then we resolve from the service
                const isNonNull = field.astNode.type.kind === Kind.NON_NULL_TYPE
                const leafKind = isNonNull ? field.astNode.type.type.kind : field.astNode.type.kind

                if (leafKind === Kind.LIST_TYPE) {
                  field.resolve = makeResolver({
                    service,
                    createOperation: createEntityReferenceResolverOperation,
                    transformData: response => response ? response.json.data._entities : (isNonNull ? [] : null),
                    isReference: true
                  })
                } else {
                  field.resolve = makeResolver({
                    service,
                    createOperation: createEntityReferenceResolverOperation,
                    transformData: response => response.json.data._entities[0],
                    isReference: true
                  })
                }
              }
            } else if (type.name === 'Subscription') {
              field.subscribe = makeResolver({
                service,
                createOperation: createQueryOperation,
                isQuery: true,
                isSubscription: true
              })
            } else {
              field.resolve = makeResolver({
                service,
                createOperation: createQueryOperation,
                transformData: response => response.json.data[fieldName],
                typeToServiceMap,
                serviceMap,
                isQuery: true
              })
            }
          } else if (serviceForType && serviceForFieldType !== null && serviceForFieldType !== serviceForType) {
            /**
             * If there is a service for the field type and a service for the type and it is not the same service,
             * it is an entity
             */
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
                // TODO this should be refactored to have a dataloader for a given entity
                // that merges all different fields for a given entity.
                transformData: response => response.json.data._entities[0][fieldName]
              })
            }
          }
        } else if (typeFieldsToService[`${type}-${fieldName}`]) {
          const service = serviceMap[typeFieldsToService[`${type}-${fieldName}`]]
          if (serviceForType === null) {
            if (type.name === 'Subscription') {
              field.subscribe = makeResolver({
                service,
                createOperation: createQueryOperation,
                isQuery: true,
                isSubscription: true
              })
            } else {
              field.resolve = makeResolver({
                service,
                createOperation: createQueryOperation,
                transformData: response => response.json.data[fieldName],
                isQuery: true
              })
            }
          } else {
            field.resolve = makeResolver({
              service,
              // TODO this should be refactored to have a dataloader for a given entity
              // that merges all different fields for a given entity.
              createOperation: createFieldResolverOperation,
              transformData: response => response.json.data._entities[0][fieldName]
            })
          }
        } else {
          // This implementation is only partially correct.
          // In case a field is not returned by the parent resolver
          // and the parent is a reference, we would have no way to
          // fetch it. This happens only when top-level resolvers
          // (Query and Mutation) returns a single type.
          // We directly work around this inside makeResolver.
          field.resolve = (parent, args, context, info) => {
            return parent && parent[info.path.key]
          }
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

  const serviceMap = await buildServiceMap(services, errorHandler, app.log)

  const serviceSDLs = Object.entries(serviceMap).reduce((acc, [name, value]) => {
    const { schemaDefinition, error } = value

    error !== null
      ? app.log.warn(`Initializing service "${name}" failed with message: "${error.message}"`)
      : acc.push(schemaDefinition)

    return acc
  }, [])

  if (serviceSDLs.length < 1) {
    for (const service of Object.values(serviceMap)) {
      service.close()
    }
    throw new MER_ERR_GQL_GATEWAY_INIT('No valid service SDLs were provided')
  }

  const schema = buildFederatedSchema(serviceSDLs.join(''), true)

  const typeToServiceMap = {}
  const typeFieldsToService = {}
  let allTypes = []
  const factory = new Factory()
  app.decorateReply(kEntityResolvers)
  app.addHook('onRequest', async function (req, reply) {
    reply[kEntityResolvers] = factory.create()
  })

  for (const [service, serviceDefinition] of Object.entries(serviceMap)) {
    for (const type of serviceDefinition.types) {
      allTypes.push(serviceDefinition.schema.getTypeMap()[type])
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
      // context is the same for each query, but unfortunately it's not acessible from onRequest
      // where we do factory.create(). What is a cleaner option?
      const context = queries[0].context
      const result = await getQueryResult({
        context, queries, serviceDefinition, service
      })

      return result
    }, query => query.id)
  }

  typeToServiceMap.Query = null
  typeToServiceMap.Mutation = null
  typeToServiceMap.Subscription = null

  const valueTypes = findValueTypes(allTypes)
  for (const typeName of valueTypes) {
    typeToServiceMap[typeName] = null
  }

  defineResolvers(schema, typeToServiceMap, serviceMap, typeFieldsToService)

  return {
    schema,
    serviceMap,
    entityResolversFactory: factory,
    pollingInterval: gatewayOpts.pollingInterval,
    async refresh (isRetry) {
      const failedMandatoryServices = []
      if (this._serviceSDLs === undefined) {
        this._serviceSDLs = serviceSDLs.join('')
      }

      const $refreshResult = await Promise.allSettled(
        Object.values(serviceMap).map((service) =>
          service.refresh().catch((err) => {
            // If non-mandatory service or if retry count has exceeded for mandatory service then throw
            if (!service.mandatory || !isRetry) {
              errorHandler(err, service)
            }

            // If service is mandatory and retry count has not exceeded then add to service to
            // failedMandatoryServices so it can be returned for retrying
            if (service.mandatory) {
              failedMandatoryServices.push(service)
            }
          })
        )
      )

      if (failedMandatoryServices.length > 0) {
        const serviceNames = failedMandatoryServices.map(service => service.name)
        const err = new MER_ERR_SERVICE_RETRY_FAILED(serviceNames.join(', '))
        err.failedServices = serviceNames
        throw err
      }

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

      allTypes = []

      for (const [service, serviceDefinition] of Object.entries(serviceMap)) {
        for (const type of serviceDefinition.types) {
          allTypes.push(serviceDefinition.schema.getTypeMap()[type])
          typeToServiceMap[type] = service
        }

        for (const [type, fields] of Object.entries(serviceDefinition.extensionTypeMap)) {
          for (const field of fields) {
            typeFieldsToService[`${type}-${field}`] = service
          }
        }
      }

      await Promise.allSettled(
        Object.values(serviceMap).map((service) =>
          service.reconnectSubscription()
        )
      )

      const schema = buildFederatedSchema(_serviceSDLs, true)

      typeToServiceMap.Query = null
      typeToServiceMap.Mutation = null
      typeToServiceMap.Subscription = null

      const valueTypes = findValueTypes(allTypes)
      for (const typeName of valueTypes) {
        typeToServiceMap[typeName] = null
      }

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
