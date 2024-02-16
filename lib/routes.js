'use strict'

const { join } = require('path')
const Static = require('@fastify/static')
const subscription = require('./subscription')
const { kRequestContext } = require('./symbols')
const sJSON = require('secure-json-parse')
const {
  defaultErrorFormatter,
  MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND,
  MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED,
  MER_ERR_GQL_VALIDATION,
  toGraphQLError
} = require('./errors')

const responseProperties = {
  data: {
    type: ['object', 'null'],
    additionalProperties: true
  },
  errors: {
    type: 'array',
    items: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
        locations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line: { type: 'integer' },
              column: { type: 'integer' }
            }
          }
        },
        path: {
          type: 'array',
          items: { type: 'string' }
        },
        extensions: {
          type: 'object',
          properties: {

            code: { type: 'string' }
          },
          additionalProperties: true
        }
      }
    }
  },
  extensions: {
    type: 'object',
    additionalProperties: true
  }
}

const requestProperties = {
  query: {
    type: 'string'
  },
  persisted: {
    type: 'boolean'
  },
  operationName: {
    type: ['string', 'null']
  }
}

const getSchema = {
  querystring: {
    type: 'object',
    properties: {
      ...requestProperties,
      variables: {
        type: 'string' // Stringified JSON
      },
      extensions: {
        type: 'string' // Stringified JSON
      }
    }
  },
  response: {
    '2xx': {
      type: 'object',
      properties: responseProperties
    }
  }
}

const postSchema = (allowBatchedQueries) => {
  let body = {
    type: 'object',
    properties: {
      ...requestProperties,
      variables: {
        type: ['object', 'null']
      },
      extensions: {
        type: 'object'
      }
    }
  }

  if (allowBatchedQueries) {
    body = {
      anyOf: [{
        ...body
      }, {
        type: 'array',
        items: {
          ...body
        }
      }]
    }
  }
  return {
    body,
    // JSON schema isn't allowing ['object', 'array'] on response.
    response: allowBatchedQueries
      ? {}
      : {
          '2xx': {
            type: 'object',
            properties: responseProperties
          }
        }
  }
}

function validationHandler (validationError) {
  if (validationError) {
    const err = new MER_ERR_GQL_VALIDATION()
    err.errors = [validationError]
    throw err
  }
}

function tryJSONParse (request, value) {
  try {
    return sJSON.parse(value)
  } catch (err) {
    const wrap = new MER_ERR_GQL_VALIDATION()
    err.code = wrap.code
    err.statusCode = wrap.statusCode
    throw err
  }
}

module.exports = async function (app, opts) {
  const errorFormatter = typeof opts.errorFormatter === 'function' ? opts.errorFormatter : defaultErrorFormatter
  const contextFn = opts.context

  if (typeof opts.errorHandler === 'function') {
    app.setErrorHandler(async (error, request, reply) => {
      const errorHandler = opts.errorHandler
      if (!request[kRequestContext]) {
        // Generate the context for this request
        if (contextFn) {
          request[kRequestContext] = await contextFn(request, reply)
          Object.assign(request[kRequestContext], { reply, app })
        } else {
          request[kRequestContext] = { reply, app }
        }
      }

      return errorHandler(error, request, reply)
    })
  } else if (opts.errorHandler === true || opts.errorHandler === undefined) {
    app.setErrorHandler(async (error, request, reply) => {
      if (!request[kRequestContext]) {
        // Generate the context for this request
        if (contextFn) {
          request[kRequestContext] = await contextFn(request, reply)
          Object.assign(request[kRequestContext], { reply, app })
        } else {
          request[kRequestContext] = { reply, app }
        }
      }

      const { statusCode, response } = errorFormatter(
        { errors: [toGraphQLError(error)] },
        request[kRequestContext]
      )
      return reply.code(statusCode).send(response)
    })
  }
  const { subscriptionContextFn } = opts

  app.decorateRequest(kRequestContext)

  const {
    path: graphqlPath = '/graphql',
    subscriber,
    verifyClient,
    onConnect,
    onDisconnect,
    entityResolversFactory,
    persistedQueryProvider,
    allowBatchedQueries,
    keepAlive,
    fullWsTransport,
    additionalRouteOptions
  } = opts

  // Load the persisted query settings
  const {
    isPersistedQuery,
    getHash,
    getQueryFromHash,
    getHashForQuery,
    saveQuery,
    notFoundError,
    notSupportedError
  } = persistedQueryProvider || {}

  const normalizedRouteOptions = { ...additionalRouteOptions }
  if (normalizedRouteOptions.handler || normalizedRouteOptions.wsHandler) {
    normalizedRouteOptions.handler = undefined
    normalizedRouteOptions.wsHandler = undefined
  }

  async function executeQuery (query, variables, operationName, request, reply) {
    // Validate a query is present
    if (!query) {
      return new MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND('Unknown query')
    }

    // Handle the query, throwing an error if required
    return reply.graphql(
      query,
      Object.assign(
        request[kRequestContext],
        { pubsub: subscriber, __currentQuery: query }
      ),
      variables,
      operationName
    )
  }

  function executeRegularQuery (body, request, reply) {
    const { query, operationName, variables } = body
    return executeQuery(query, variables, operationName, request, reply)
  }

  async function executePersistedQuery (body, request, reply) {
    let { query } = body
    const { operationName, variables } = body

    // Verify if a query matches the persisted format
    const persisted = isPersistedQuery(body)
    if (persisted) {
      // This is a peristed query, so we use the hash in the request
      // to load the full query string.

      // Extract the hash from the request
      const hash = getHash && getHash(body)
      if (hash) {
        // Load the query for the provided hash
        query = await getQueryFromHash(hash)

        if (!query) {
          // Query has not been found, tell the client
          throw new MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND(notFoundError)
        }

        // The query has now been set to the full query string
      } else {
        // This client should stop sending persisted queries,
        // as we do not recognise them
        throw new MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED(notSupportedError)
      }
    }

    // Execute the query
    const result = await executeQuery(query, variables, operationName, request, reply)

    // Only save queries which are not yet persisted
    if (!persisted && query) {
      // If provided the getHashForQuery, saveQuery settings we save this query
      const hash = getHashForQuery && getHashForQuery(query)
      if (hash) {
        try {
          await saveQuery(hash, query)
        } catch (err) {
          request.log.warn({ err, hash, query }, 'Failed to persist query')
        }
      }
    }

    // Return the result
    return result
  }

  const execute = persistedQueryProvider ? executePersistedQuery : executeRegularQuery

  const getOptions = {
    url: graphqlPath,
    method: 'GET',
    schema: getSchema,
    attachValidation: true,
    ...normalizedRouteOptions,
    handler: async function (request, reply) {
      // Generate the context for this request
      if (contextFn) {
        request[kRequestContext] = await contextFn(request, reply)
        Object.assign(request[kRequestContext], { reply, app })
      } else {
        request[kRequestContext] = { reply, app }
      }

      validationHandler(request.validationError)

      const { variables, extensions } = request.query

      return execute({
        ...request.query,
        // Parse variables and extensions from stringified JSON
        variables: variables && tryJSONParse(request, variables),
        extensions: extensions && tryJSONParse(request, extensions)
      }, request, reply)
    }
  }

  if (subscriber) {
    app.register(subscription, {
      getOptions,
      subscriber,
      verifyClient,
      onConnect,
      onDisconnect,
      entityResolversFactory,
      subscriptionContextFn,
      keepAlive,
      fullWsTransport,
      errorFormatter
    })
  } else {
    app.route(getOptions)
  }

  app.addContentTypeParser('application/graphql', { parseAs: 'string' }, function (req, payload, done) {
    done(null, { query: payload })
  })

  app.post(graphqlPath, {
    schema: postSchema(allowBatchedQueries),
    attachValidation: true,
    ...normalizedRouteOptions
  }, async function (request, reply) {
    // Generate the context for this request
    if (contextFn) {
      request[kRequestContext] = await contextFn(request, reply)
      Object.assign(request[kRequestContext], { reply, app })
    } else {
      request[kRequestContext] = { reply, app }
    }

    validationHandler(request.validationError)

    if (allowBatchedQueries && Array.isArray(request.body)) {
      // Batched query
      const operationsCount = request.body.length

      Object.assign(request[kRequestContext], { operationsCount })

      return Promise.all(request.body.map(async (r, operationId) => {
        // Create individual reqs for multiple operations, otherwise reference the original req
        const operationReq = operationsCount > 1
          ? {
              ...request,
              [kRequestContext]: Object.create(request[kRequestContext])
            }
          : request

        Object.assign(operationReq[kRequestContext], { operationId })

        try {
          return await execute(r, operationReq, reply)
        } catch (e) {
          const { response } = errorFormatter({ errors: [toGraphQLError(e)] }, request[kRequestContext])
          return response
        }
      }))
    } else {
      // Regular query
      return execute(request.body, request, reply)
    }
  })

  if (opts.ide) {
    app.register(Static, {
      root: join(__dirname, '../static'),
      wildcard: false,
      serve: false
    })

    if (opts.ide === true || opts.ide === 'graphiql' || (typeof opts.ide === 'object' && opts.ide !== null && opts.ide.enabled !== false)) {
      app.get('/graphiql', (req, reply) => {
        reply.sendFile('graphiql.html')
      })

      app.get('/graphiql/main.js', (req, reply) => {
        reply.sendFile('main.js')
      })

      app.get('/graphiql/sw.js', (req, reply) => {
        reply.sendFile('sw.js')
      })

      app.get('/graphiql/config.js', (req, reply) => {
        const configRows = [
          `window.GRAPHQL_ENDPOINT = '${app.prefix}${graphqlPath}'`
        ]

        const plugins = []
        const idePlugins = opts.ide.plugins || []
        idePlugins.forEach(plugin => {
          if (plugin.name) {
            configRows.push(`window.GRAPIHQL_PLUGIN_${plugin.name.toUpperCase()} = ${JSON.stringify(plugin)}`)
            plugins.push(plugin.name)
          } else {
            app.log.warn('Graphiql plugin without a name defined')
          }
        })

        configRows.push(`window.GRAPHIQL_PLUGIN_LIST = ${JSON.stringify(plugins)}`)

        reply
          .header('Content-Type', 'application/javascript')
          .send(configRows.join(';\n'))
      })
    }
  }
}
