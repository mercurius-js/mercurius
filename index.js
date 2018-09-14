'use strict'

const fp = require('fastify-plugin')
const LRU = require('tiny-lru')
const {
  graphql,
  parse,
  buildSchema,
  GraphQLObjectType,
  GraphQLSchema,
  extendSchema,
  buildASTSchema,
  validate,
  validateSchema,
  execute
} = require('graphql')

module.exports = fp(async function (app, opts) {
  const lru = LRU(1000)

  let root = opts.root
  let schema = opts.schema

  if (typeof schema === 'string') {
    schema = buildSchema(schema)
  } else {
    schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { },
      })
    })
  }

  app.ready(async function (err) {
    if (err) {
      throw err
    }

    const schemaValidationErrors = validateSchema(schema);
    if (schemaValidationErrors.length > 0) {
      const err = new Error('schema issues')
      err.errors = schemaValidationErrors
      throw err
    }
  })

  const graphqlCtx = Symbol('ctx')

  // TODO send a PR to fastify, this should not be needed
  app.addHook('preHandler', function (req, reply, next) {
    reply[graphqlCtx] = this
    next()
  })

  app.decorateReply(graphqlCtx, null)

  app.decorateReply('graphql', function (source, context, variables) {
    return this[graphqlCtx].graphql(source, Object.assign({ reply: this }, context), variables)
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

  function fastifyGraphQl (source, context, variables) {
    context = Object.assign({ app: this }, context)

    // Parse, with a little lru
    let document = lru.get(source)
    if (!document) {
      try {
        document = parse(source)
        lru.set(source, document)
      } catch (syntaxError) {
        return { errors: [syntaxError] };
      }
    }

    // Validate
    const validationErrors = validate(schema, document);
    if (validationErrors.length > 0) {
      return { errors: validationErrors };
    }

    // Execute
    return execute(
      schema,
      document,
      root,
      context,
      variables
    )
  }
})

