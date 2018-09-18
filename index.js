'use strict'

const fp = require('fastify-plugin')
const LRU = require('tiny-lru')
const routes = require('./routes')
const {
  parse,
  buildSchema,
  GraphQLObjectType,
  GraphQLSchema,
  extendSchema,
  validate,
  validateSchema,
  execute
} = require('graphql')

function buildCache (opts) {
  if (opts.hasOwnProperty('cache')) {
    if (opts.cache === false) {
      // no cache
      return
    } else if (typeof opts.cache === 'number') {
      // cache size as specified
      return LRU(opts.cache)
    }
  }

  // default cache, 1024 entries
  return LRU(1024)
}

module.exports = fp(async function (app, opts) {
  const lru = buildCache(opts)

  let root = opts.root
  let schema = opts.schema

  if (typeof schema === 'string') {
    schema = buildSchema(schema)
  } else {
    schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { }
      })
    })
  }

  app.ready(async function (err) {
    if (err) {
      throw err
    }

    const schemaValidationErrors = validateSchema(schema)
    if (schemaValidationErrors.length > 0) {
      const err = new Error('schema issues')
      err.errors = schemaValidationErrors
      throw err
    }
  })

  const graphqlCtx = Symbol('ctx')

  if (opts.routes !== false) app.register(routes)

  app.decorateReply(graphqlCtx, null)

  app.decorateReply('graphql', function (source, context, variables, operationName) {
    return app.graphql(source, Object.assign({ reply: this }, context), variables, operationName)
  })

  app.decorate('graphql', fastifyGraphQl)

  fastifyGraphQl.extendSchema = function (s) {
    if (typeof s === 'string') {
      s = parse(s)
    }

    schema = extendSchema(schema, s)
  }

  fastifyGraphQl.defineResolvers = function (resolvers) {
    root = Object.assign({}, root, resolvers)
  }

  function fastifyGraphQl (source, context, variables, operationName) {
    context = Object.assign({ app: this }, context)

    // Parse, with a little lru
    let cached = lru && lru.get(source)
    let document = null
    if (!cached) {
      try {
        document = parse(source)

        // Validate
        const validationErrors = validate(schema, document)

        if (lru) {
          lru.set(source, { document, validationErrors })
        }

        if (validationErrors.length > 0) {
          return { errors: validationErrors }
        }
      } catch (syntaxError) {
        return { errors: [syntaxError] }
      }
    } else if (cached.validationErrors.length > 0) {
      return { errors: cached.validationErrors }
    } else {
      document = cached.document
    }

    // Execute
    return execute(
      schema,
      document,
      root,
      context,
      variables,
      operationName
    )
  }
})
