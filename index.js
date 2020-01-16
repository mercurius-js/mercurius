'use strict'

const fp = require('fastify-plugin')
const LRU = require('tiny-lru')
const routes = require('./lib/routes')
const { BadRequest, MethodNotAllowed, InternalServerError } = require('http-errors')
const { compileQuery } = require('graphql-jit')
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
  execute
} = require('graphql')
const queryDepth = require('./lib/queryDepth')

const kLoaders = Symbol('fastify-gql.loaders')

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
      throw new Error('Cache type is not supported')
    }
  }

  // default cache, 1024 entries
  return LRU(1024)
}

module.exports = fp(async function (app, opts) {
  const lru = buildCache(opts)
  const lruErrors = buildCache(opts)

  const minJit = opts.jit || 0
  const queryDepthLimit = opts.queryDepth

  if (typeof minJit !== 'number') {
    throw new Error('the jit option must be a number')
  }

  const root = {}
  let schema = opts.schema

  if (typeof schema === 'string') {
    schema = buildSchema(schema)
  } else if (!opts.schema) {
    schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {}
      }),
      mutation: opts.defineMutation ? new GraphQLObjectType({
        name: 'Mutation',
        fields: {}
      }) : undefined
    })
  }

  app.ready(async function () {
    const schemaValidationErrors = validateSchema(schema)
    if (schemaValidationErrors.length > 0) {
      const err = new Error('schema issues')
      err.errors = schemaValidationErrors
      throw err
    }
  })

  const graphqlCtx = Symbol('ctx')

  if (opts.routes !== false) {
    const optsIde = opts.graphiql || opts.ide
    app.register(routes, {
      errorHandler: opts.errorHandler,
      ide: optsIde,
      prefix: opts.prefix,
      path: opts.path,
      context: opts.context,
      schema,
      subscription: opts.subscription
    })
  }

  app.decorateReply(graphqlCtx, null)

  app.decorateReply('graphql', function (source, context, variables, operationName) {
    return app.graphql(source, Object.assign({ reply: this }, context), variables, operationName)
  })

  app.decorate('graphql', fastifyGraphQl)

  fastifyGraphQl.replaceSchema = function (s) {
    if (!s || typeof s !== 'object') {
      throw new Error('Must provide valid Document AST')
    }

    schema = s

    lru.clear()
    lruErrors.clear()
  }

  fastifyGraphQl.extendSchema = function (s) {
    if (typeof s === 'string') {
      s = parse(s)
    } else if (!s || typeof s !== 'object') {
      throw new Error('Must provide valid Document AST')
    }

    schema = extendSchema(schema, s)
  }

  fastifyGraphQl.defineResolvers = function (resolvers) {
    for (const name of Object.keys(resolvers)) {
      const type = schema.getType(name)

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
          if (name === 'Subscription') {
            fields[prop] = {
              ...fields[prop],
              ...resolver[prop]
            }
          } else {
            fields[prop].resolve = resolver[prop]
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
        throw new Error(`Cannot find type ${name}`)
      }
    }
  }

  let factory

  fastifyGraphQl.defineLoaders = function (loaders) {
    // set up the loaders factory
    if (!factory) {
      factory = new Factory()
      app.decorateReply(kLoaders)
      app.addHook('onRequest', async function (req, reply) {
        reply[kLoaders] = factory.create({ req, reply, app })
      })
    }

    function defineLoader (name) {
      // async needed because of throw
      return async function (obj, params, { reply }) {
        if (!reply) {
          throw new Error('loaders only work via reply.graphql()')
        }
        return reply[kLoaders][name]({ obj, params })
      }
    }

    const resolvers = {}
    for (const typeKey of Object.keys(loaders)) {
      const type = loaders[typeKey]
      resolvers[typeKey] = {}
      for (const prop of Object.keys(type)) {
        const name = typeKey + '-' + prop
        resolvers[typeKey][prop] = defineLoader(name)
        if (typeof type[prop] === 'function') {
          factory.add(name, type[prop])
        } else {
          factory.add(name, type[prop].opts, type[prop].loader)
        }
      }
    }
    fastifyGraphQl.defineResolvers(resolvers)
  }

  if (opts.resolvers) {
    fastifyGraphQl.defineResolvers(opts.resolvers)
  }

  if (opts.loaders) {
    fastifyGraphQl.defineLoaders(opts.loaders)
  }

  async function fastifyGraphQl (source, context, variables, operationName) {
    context = Object.assign({ app: this }, context)
    const reply = context.reply

    // Parse, with a little lru
    const cached = lru !== null && lru.get(source)
    let document = null
    if (!cached) {
      // We use two caches to avoid errors bust the good
      // cache. This is a protection against DoS attacks
      const cachedError = lruErrors !== null && lruErrors.get(source)

      if (cachedError) {
        // this query errored
        const err = new BadRequest()
        err.errors = cachedError.validationErrors
        throw err
      }

      try {
        document = parse(source)
      } catch (syntaxError) {
        const err = new BadRequest()
        err.errors = [syntaxError]
        throw err
      }

      // Validate
      const validationErrors = validate(schema, document)

      if (validationErrors.length > 0) {
        if (lruErrors) {
          lruErrors.set(source, { document, validationErrors })
        }
        const err = new BadRequest()
        err.errors = validationErrors
        throw err
      }

      if (queryDepthLimit) {
        const queryDepthErrors = queryDepth(document.definitions, queryDepthLimit)

        if (queryDepthErrors.length > 0) {
          const err = new BadRequest()
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
        const err = new MethodNotAllowed()
        err.errors = [new Error('Operation cannot be perfomed via a GET request')]
        throw err
      }
    }

    // minJit is 0 by default
    if (cached && cached.count++ === minJit) {
      cached.jit = compileQuery(schema, document, operationName)
    }

    if (cached && cached.jit !== null) {
      const res = await cached.jit.query(root, context, variables || {})
      return res
    }

    const execution = await execute(
      schema,
      document,
      root,
      context,
      variables,
      operationName
    )
    if (execution.errors) {
      const err = new InternalServerError()
      err.errors = execution.errors
      err.data = execution.data
      throw err
    }

    return execution
  }
}, {
  name: 'fastify-gql'
})
