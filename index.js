'use strict'

const fp = require('fastify-plugin')
const LRU = require('tiny-lru')
const routes = require('./lib/routes')
const { compileQuery, isCompiledQuery } = require('graphql-jit')
const { Factory } = require('single-user-cache')
const {
  parse,
  buildSchema,
  getOperationAST,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLSchema,
  extendSchema,
  validate,
  validateSchema,
  specifiedRules,
  execute
} = require('graphql')
const { buildExecutionContext } = require('graphql/execution/execute')
const queryDepth = require('./lib/queryDepth')
const buildFederationSchema = require('./lib/federation')
const buildGateway = require('./lib/gateway')
const mq = require('mqemitter')
const { PubSub, withFilter } = require('./lib/subscriber')
const persistedQueryDefaults = require('./lib/persistedQueryDefaults')
const stringify = require('safe-stable-stringify')
const {
  ErrorWithProps,
  defaultErrorFormatter,
  addErrorsToExecutionResult,
  MER_ERR_GQL_INVALID_SCHEMA,
  MER_ERR_GQL_GATEWAY,
  MER_ERR_GQL_VALIDATION,
  MER_ERR_INVALID_OPTS,
  MER_ERR_METHOD_NOT_ALLOWED,
  MER_ERR_INVALID_METHOD
} = require('./lib/errors')
const { Hooks, assignLifeCycleHooksToContext, assignApplicationLifecycleHooksToContext } = require('./lib/hooks')
const { kLoaders, kFactory, kSubscriptionFactory, kHooks } = require('./lib/symbols')
const { preParsingHandler, preValidationHandler, preExecutionHandler, onResolutionHandler, onGatewayReplaceSchemaHandler } = require('./lib/handlers')

function buildCache (opts) {
  if (Object.prototype.hasOwnProperty.call(opts, 'cache')) {
    const isBoolean = typeof opts.cache === 'boolean'
    const isNumber = typeof opts.cache === 'number'

    if (isBoolean && opts.cache === false) {
      // no cache
      return null
    } else if (isNumber) {
      // cache size as specified
      return LRU(opts.cache)
    } else if (!isBoolean && !isNumber) {
      throw new MER_ERR_INVALID_OPTS('Cache type is not supported')
    }
  }

  // default cache, 1024 entries
  return LRU(1024)
}

const plugin = fp(async function (app, opts) {
  const lru = buildCache(opts)
  const lruErrors = buildCache(opts)
  const lruGatewayResolvers = buildCache(opts)

  if (lru && opts.validationRules && typeof opts.validationRules === 'function') {
    throw new MER_ERR_INVALID_OPTS('Using a function for the validationRules is incompatible with query caching')
  }

  const minJit = opts.jit || 0
  const queryDepthLimit = opts.queryDepth
  const errorFormatter = typeof opts.errorFormatter === 'function' ? opts.errorFormatter : defaultErrorFormatter

  if (opts.persistedQueries) {
    if (opts.onlyPersisted) {
      opts.persistedQueryProvider = persistedQueryDefaults.preparedOnly(opts.persistedQueries)

      // Disable GraphiQL
      opts.graphiql = false
      opts.ide = false
    } else {
      opts.persistedQueryProvider = persistedQueryDefaults.prepared(opts.persistedQueries)
    }
  } else if (opts.onlyPersisted) {
    throw new MER_ERR_INVALID_OPTS('onlyPersisted is true but there are no persistedQueries')
  }

  if (opts.persistedQueryProvider) {
    if (opts.persistedQueryProvider.getHash) {
      if (!opts.persistedQueryProvider.getQueryFromHash) {
        throw new MER_ERR_INVALID_OPTS('persistedQueryProvider: getQueryFromHash is required when getHash is provided')
      }
    } else {
      throw new MER_ERR_INVALID_OPTS('persistedQueryProvider: getHash is required')
    }

    if (opts.persistedQueryProvider.getHashForQuery) {
      if (!opts.persistedQueryProvider.saveQuery) {
        throw new MER_ERR_INVALID_OPTS('persistedQueryProvider: saveQuery is required when getHashForQuery is provided')
      }
    }
  }

  if (typeof minJit !== 'number') {
    throw new MER_ERR_INVALID_OPTS('the jit option must be a number')
  }

  const root = {}
  let schema = opts.schema
  let gateway = opts.gateway
  const subscriptionOpts = opts.subscription
  let emitter

  let subscriber
  let verifyClient
  let subscriptionContextFn
  let onConnect
  let onDisconnect
  let keepAlive
  let fullWsTransport

  if (typeof subscriptionOpts === 'object') {
    if (subscriptionOpts.pubsub) {
      subscriber = subscriptionOpts.pubsub
    } else {
      emitter = subscriptionOpts.emitter || mq()
      subscriber = new PubSub(emitter)
    }
    verifyClient = subscriptionOpts.verifyClient
    subscriptionContextFn = subscriptionOpts.context
    onConnect = subscriptionOpts.onConnect
    onDisconnect = subscriptionOpts.onDisconnect
    keepAlive = subscriptionOpts.keepAlive
    fullWsTransport = subscriptionOpts.fullWsTransport
  } else if (subscriptionOpts === true) {
    emitter = mq()
    subscriber = new PubSub(emitter)
  }

  if (subscriptionOpts) {
    fastifyGraphQl.pubsub = subscriber
  }

  if (gateway && (schema || opts.resolvers || opts.loaders)) {
    throw new MER_ERR_INVALID_OPTS('Adding "schema", "resolvers" or "loaders" to plugin options when plugin is running in gateway mode is not allowed')
  }

  if (gateway && Array.isArray(gateway.services)) {
    const serviceNames = new Set()
    for (const service of gateway.services) {
      if (typeof service !== 'object') {
        throw new MER_ERR_INVALID_OPTS('gateway: all "services" must be objects')
      }
      if (typeof service.name !== 'string') {
        throw new MER_ERR_INVALID_OPTS('gateway: all "services" must have a "name" String property')
      }
      if (serviceNames.has(service.name)) {
        throw new MER_ERR_INVALID_OPTS(`gateway: all "services" must have a unique "name": "${service.name}" is already used`)
      }
      serviceNames.add(service.name)
      if (typeof service.url !== 'string' && (!Array.isArray(service.url) || service.url.length === 0 || !service.url.every(url => typeof url === 'string'))) {
        throw new MER_ERR_INVALID_OPTS('gateway: all "services" must have an "url" String, or a non-empty Array of String, property')
      }
    }
  }

  if (Array.isArray(schema)) {
    schema = schema.join('\n')
  }

  if (typeof schema === 'string') {
    if (opts.federationMetadata) {
      schema = buildFederationSchema(schema)
    } else {
      schema = buildSchema(schema)
    }
  } else if (!opts.schema && !gateway) {
    schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {}
      }),
      mutation: opts.defineMutation
        ? new GraphQLObjectType({
          name: 'Mutation',
          fields: {}
        })
        : undefined
    })
  }

  let entityResolversFactory
  let gatewayRetryIntervalTimer = null
  const retryServicesCount = gateway && gateway.retryServicesCount ? gateway.retryServicesCount : 10

  const retryServices = (interval) => {
    let retryCount = 0
    let isRetry = true

    return setInterval(async () => {
      try {
        if (retryCount === retryServicesCount) {
          clearInterval(gatewayRetryIntervalTimer)
          isRetry = false
        }
        retryCount++

        const context = assignApplicationLifecycleHooksToContext({}, fastifyGraphQl[kHooks])
        const schema = await gateway.refresh(isRetry)
        /* istanbul ignore next */
        if (schema !== null) {
          clearInterval(gatewayRetryIntervalTimer)
          // Trigger onGatewayReplaceSchema hook
          if (context.onGatewayReplaceSchema !== null) {
            await onGatewayReplaceSchemaHandler(context, { instance: app, schema })
          }
          fastifyGraphQl.replaceSchema(schema)
        }
      } catch (error) {
        app.log.error(error)
      }
    }, interval)
  }

  if (gateway) {
    const retryInterval = gateway.retryServicesInterval || 3000
    gateway = await buildGateway(gateway, app)

    const serviceMap = Object.values(gateway.serviceMap)
    const failedMandatoryServices = serviceMap.filter(service => !!service.error && service.mandatory)

    if (failedMandatoryServices.length) {
      gatewayRetryIntervalTimer = retryServices(retryInterval)
      gatewayRetryIntervalTimer.unref()
    }

    schema = gateway.schema
    entityResolversFactory = gateway.entityResolversFactory

    let gatewayInterval = null

    if (gateway.pollingInterval !== undefined) {
      if (typeof gateway.pollingInterval === 'number') {
        gatewayInterval = setInterval(async () => {
          try {
            const context = assignApplicationLifecycleHooksToContext({}, fastifyGraphQl[kHooks])
            const schema = await gateway.refresh()
            if (schema !== null) {
              // Trigger onGatewayReplaceSchema hook
              if (context.onGatewayReplaceSchema !== null) {
                await onGatewayReplaceSchemaHandler(context, { instance: app, schema })
              }
              fastifyGraphQl.replaceSchema(schema)
            }
          } catch (error) {
            app.log.error(error)
          }
        }, gateway.pollingInterval)
      } else {
        app.log.warn(`Expected a number for 'gateway.pollingInterval', received: ${typeof gateway.pollingInterval}`)
      }
    }

    app.onClose((fastify, next) => {
      gateway.close()
      if (gatewayInterval !== null) {
        clearInterval(gatewayInterval)
      }
      if (gatewayRetryIntervalTimer !== null) {
        clearInterval(gatewayRetryIntervalTimer)
      }
      setImmediate(next)
    })

    fastifyGraphQl.gateway = gateway
  }

  fastifyGraphQl.schema = schema

  app.addHook('onReady', async function () {
    const schemaValidationErrors = validateSchema(fastifyGraphQl.schema)
    if (schemaValidationErrors.length === 1) {
      throw schemaValidationErrors[0]
    } else if (schemaValidationErrors.length > 1) {
      const err = new MER_ERR_GQL_INVALID_SCHEMA()
      err.errors = schemaValidationErrors
      throw err
    }
  })

  const graphqlCtx = Symbol('ctx')

  if (opts.routes !== false) {
    const optsIde = opts.graphiql || opts.ide
    app.register(routes, {
      errorHandler: opts.errorHandler,
      errorFormatter: opts.errorFormatter,
      ide: optsIde,
      prefix: opts.prefix,
      path: opts.path,
      context: opts.context,
      persistedQueryProvider: opts.persistedQueryProvider,
      allowBatchedQueries: opts.allowBatchedQueries,
      subscriber,
      verifyClient,
      onConnect,
      onDisconnect,
      lruGatewayResolvers,
      entityResolversFactory,
      subscriptionContextFn,
      keepAlive,
      fullWsTransport
    })
  }

  app.decorateReply(graphqlCtx, null)

  app.decorateReply('graphql', function (source, context, variables, operationName) {
    if (!context) {
      context = {}
    }

    context = Object.assign(context, { reply: this, app })
    if (app[kFactory]) {
      if (!opts.allowBatchedQueries || !this[kLoaders]) {
        this[kLoaders] = app[kFactory].create(context)
      }
    }

    return app.graphql(source, context, variables, operationName)
  })

  app.decorate('graphql', fastifyGraphQl)

  fastifyGraphQl.replaceSchema = function (s) {
    if (!s || typeof s !== 'object') {
      throw new MER_ERR_INVALID_OPTS('Must provide valid Document AST')
    }

    fastifyGraphQl.schema = s

    if (lru) {
      lru.clear()
    }
    if (lruErrors) {
      lruErrors.clear()
    }
    if (lruGatewayResolvers) {
      lruGatewayResolvers.clear()
    }
  }

  fastifyGraphQl.extendSchema = function (s) {
    if (gateway) {
      throw new MER_ERR_GQL_GATEWAY('Calling extendSchema method when plugin is running in gateway mode is not allowed')
    }
    if (opts.federationMetadata) {
      throw new MER_ERR_INVALID_METHOD('Calling extendSchema method when federationMetadata is enabled is not allowed')
    }

    if (typeof s === 'string') {
      s = parse(s)
    } else if (!s || typeof s !== 'object') {
      throw new MER_ERR_INVALID_OPTS('Must provide valid Document AST')
    }

    fastifyGraphQl.schema = extendSchema(fastifyGraphQl.schema, s)
  }

  fastifyGraphQl.defineResolvers = function (resolvers) {
    if (gateway) {
      throw new MER_ERR_GQL_GATEWAY('Calling defineResolvers method when plugin is running in gateway mode is not allowed')
    }

    const subscriptionTypeName = (schema.getSubscriptionType() || {}).name || 'Subscription'
    const subscriptionsActive = !!fastifyGraphQl.pubsub

    for (const name of Object.keys(resolvers)) {
      const type = fastifyGraphQl.schema.getType(name)

      if (typeof resolvers[name] === 'function') {
        root[name] = resolvers[name]
      } else if (type instanceof GraphQLObjectType) {
        const fields = type.getFields()
        const resolver = resolvers[name]
        if (resolver.isTypeOf) {
          type.isTypeOf = resolver.isTypeOf
          delete resolver.isTypeOf
        }
        for (const prop of Object.keys(resolver)) {
          if (subscriptionsActive && name === subscriptionTypeName) {
            fields[prop] = {
              ...fields[prop],
              ...resolver[prop]
            }
          } else if (prop === '__resolveReference') {
            type.resolveReference = resolver[prop]
          } else if (fields[prop]) {
            fields[prop].resolve = resolver[prop]
          } else {
            throw new MER_ERR_INVALID_OPTS(`Cannot find field ${prop} of type ${type}`)
          }
        }
      } else if (type instanceof GraphQLScalarType || type instanceof GraphQLEnumType) {
        const resolver = resolvers[name]
        for (const prop of Object.keys(resolver)) {
          type[prop] = resolver[prop]
        }
      } else if (type instanceof GraphQLInterfaceType || type instanceof GraphQLUnionType) {
        const resolver = resolvers[name]
        type.resolveType = resolver.resolveType
      } else {
        throw new MER_ERR_INVALID_OPTS(`Cannot find type ${name}`)
      }
    }
  }

  let factory
  let subscriptionFactory

  fastifyGraphQl.defineLoaders = function (loaders) {
    if (gateway) {
      throw new MER_ERR_GQL_GATEWAY('Calling defineLoaders method when plugin is running in gateway mode is not allowed')
    }

    // set up the loaders factory
    if (!factory) {
      factory = new Factory()
      app.decorateReply(kLoaders)
      app.decorate(kFactory, factory)
    }

    if (!subscriptionFactory) {
      subscriptionFactory = new Factory()
      app.decorate(kSubscriptionFactory, subscriptionFactory)
    }

    function defineLoader (name, opts) {
      // async needed because of throw
      return async function (obj, params, ctx, info) {
        const { reply } = ctx
        if (!reply) {
          throw new MER_ERR_INVALID_OPTS('loaders only work via reply.graphql()')
        }

        const query = opts.cache === false ? { obj, params, info } : { obj, params }

        return reply[kLoaders][name](query)
      }
    }

    function serialize (query) {
      if (query.info) {
        return stringify({ obj: query.obj, params: query.params })
      }
      return query
    }

    const resolvers = {}
    for (const typeKey of Object.keys(loaders)) {
      const type = loaders[typeKey]
      resolvers[typeKey] = {}
      for (const prop of Object.keys(type)) {
        const name = typeKey + '-' + prop
        const toAssign = [{}, type[prop].opts || {}]
        if (opts.cache === false) {
          toAssign.push({
            cache: false
          })
        }
        const factoryOpts = Object.assign(...toAssign)
        resolvers[typeKey][prop] = defineLoader(name, factoryOpts)
        if (typeof type[prop] === 'function') {
          factory.add(name, factoryOpts, type[prop], serialize)
          subscriptionFactory.add(name, { cache: false }, type[prop], serialize)
        } else {
          factory.add(name, factoryOpts, type[prop].loader, serialize)
          subscriptionFactory.add(name, Object.assign({}, type[prop].opts, { cache: false }), type[prop].loader, serialize)
        }
      }
    }
    fastifyGraphQl.defineResolvers(resolvers)
  }

  fastifyGraphQl.transformSchema = function (schemaTransforms) {
    if (!Array.isArray(schemaTransforms)) {
      schemaTransforms = [schemaTransforms]
    }

    for (const transformFn of schemaTransforms) {
      fastifyGraphQl.replaceSchema(transformFn(fastifyGraphQl.schema))
    }
  }

  if (opts.resolvers) {
    fastifyGraphQl.defineResolvers(opts.resolvers)
  }

  if (opts.loaders) {
    fastifyGraphQl.defineLoaders(opts.loaders)
  }

  if (opts.schemaTransforms) {
    fastifyGraphQl.transformSchema(opts.schemaTransforms)
  }

  fastifyGraphQl[kHooks] = new Hooks()

  // Wrapper that we expose to the user for GraphQL hooks handling
  fastifyGraphQl.addHook = function (name, fn) {
    this[kHooks].add(name, fn)
  }

  async function fastifyGraphQl (source, context, variables, operationName) {
    if (!context) {
      context = {}
    }

    context = Object.assign(context, { app: this, lruGatewayResolvers, errors: null })
    context = assignLifeCycleHooksToContext(context, fastifyGraphQl[kHooks])
    const reply = context.reply

    // Trigger preParsing hook
    if (context.preParsing !== null) {
      await preParsingHandler({ schema: fastifyGraphQl.schema, source, context })
    }

    // Parse, with a little lru
    const cached = lru !== null && lru.get(source)
    let document = null
    if (!cached) {
      // We use two caches to avoid errors bust the good
      // cache. This is a protection against DoS attacks
      const cachedError = lruErrors !== null && lruErrors.get(source)

      if (cachedError) {
        // this query errored
        const err = new MER_ERR_GQL_VALIDATION()
        err.errors = cachedError.validationErrors
        throw err
      }

      try {
        document = parse(source)
      } catch (syntaxError) {
        const err = new MER_ERR_GQL_VALIDATION()
        err.errors = [syntaxError]
        throw err
      }

      // Trigger preValidation hook
      if (context.preValidation !== null) {
        await preValidationHandler({ schema: fastifyGraphQl.schema, document, context })
      }

      // Validate
      let validationRules = []
      if (opts.validationRules) {
        if (Array.isArray(opts.validationRules)) {
          validationRules = opts.validationRules
        } else {
          validationRules = opts.validationRules({ source, variables, operationName })
        }
      }
      const validationErrors = validate(fastifyGraphQl.schema, document, [...specifiedRules, ...validationRules])

      if (validationErrors.length > 0) {
        if (lruErrors) {
          lruErrors.set(source, { document, validationErrors })
        }
        const err = new MER_ERR_GQL_VALIDATION()
        err.errors = validationErrors
        throw err
      }

      if (queryDepthLimit) {
        const queryDepthErrors = queryDepth(document.definitions, queryDepthLimit)

        if (queryDepthErrors.length > 0) {
          const err = new MER_ERR_GQL_VALIDATION()
          err.errors = queryDepthErrors
          throw err
        }
      }

      if (lru) {
        lru.set(source, { document, validationErrors, count: 1, jit: null })
      }
    } else {
      document = cached.document
    }

    if (reply && reply.request.raw.method === 'GET') {
      // let's validate we cannot do mutations here
      const operationAST = getOperationAST(document, operationName)
      if (operationAST.operation !== 'query') {
        const err = new MER_ERR_METHOD_NOT_ALLOWED()
        err.errors = [new Error('Operation cannot be performed via a GET request')]
        throw err
      }
    }

    const shouldCompileJit = cached && cached.count++ === minJit
    // Validate variables
    if (variables !== undefined && !shouldCompileJit) {
      const executionContext = buildExecutionContext({
        schema: fastifyGraphQl.schema,
        document,
        rootValue: root,
        contextValue: context,
        variableValues: variables,
        operationName
      })
      if (Array.isArray(executionContext)) {
        const err = new MER_ERR_GQL_VALIDATION()
        err.errors = executionContext
        throw err
      }
    }

    // Trigger preExecution hook
    let modifiedSchema
    let modifiedDocument
    if (context.preExecution !== null) {
      ({ modifiedSchema, modifiedDocument } = await preExecutionHandler({ schema: fastifyGraphQl.schema, document, context }))
    }

    // minJit is 0 by default
    if (shouldCompileJit) {
      if (!modifiedSchema && !modifiedDocument) {
        // can compile only when the schema and document are not modified
        cached.jit = compileQuery(fastifyGraphQl.schema, document, operationName, opts.compilerOptions)
      } else {
        // the counter must decrease to ignore the query
        cached && cached.count--
      }
    }

    if (cached && cached.jit !== null && !modifiedSchema && !modifiedDocument && isCompiledQuery(cached.jit)) {
      const execution = await cached.jit.query(root, context, variables || {})
      return maybeFormatErrors(execution, context)
    }

    const execution = await execute({
      schema: modifiedSchema || fastifyGraphQl.schema,
      document: modifiedDocument || document,
      rootValue: root,
      contextValue: context,
      variableValues: variables,
      operationName
    })

    return maybeFormatErrors(execution, context)
  }

  async function maybeFormatErrors (execution, context) {
    execution = addErrorsToExecutionResult(execution, context.errors)

    if (execution.errors) {
      const { reply } = context
      const { statusCode, response: { data, errors } } = errorFormatter(execution, context)
      execution.data = data
      execution.errors = errors
      if (reply) {
        reply.code(statusCode)
      }
    }

    // Trigger onResolution hook
    if (context.onResolution !== null) {
      await onResolutionHandler({ execution, context })
    }
    return execution
  }
}, {
  name: 'mercurius',
  fastify: '4.x'
})

plugin.ErrorWithProps = ErrorWithProps
plugin.defaultErrorFormatter = defaultErrorFormatter
plugin.persistedQueryDefaults = persistedQueryDefaults
plugin.buildFederationSchema = buildFederationSchema
plugin.withFilter = withFilter

module.exports = plugin
