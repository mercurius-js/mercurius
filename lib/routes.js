'use strict'

const { join } = require('path')
const Static = require('fastify-static')
const subscription = require('./subscription')
const sJSON = require('secure-json-parse')
const {
  defaultErrorFormatter,
  MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND,
  MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED,
  MER_ERR_GQL_VALIDATION
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

const postSchema = (allowBatchedQueries) => ({
  body: {
    type: allowBatchedQueries ? ['object', 'array'] : 'object',
    properties: {
      ...requestProperties,
      variables: {
        type: ['object', 'null']
      },
      extensions: {
        type: 'object'
      }
    }
  },
  // JSON schema isn't allowing ['object', 'array'] on response.
  response: allowBatchedQueries
    ? {}
    : {
        '2xx': {
          type: 'object',
          properties: responseProperties
        }
      }
})

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
    request.log.info({ err: err })
    throw new MER_ERR_GQL_VALIDATION(err.message)
  }
}

module.exports = async function (app, opts) {
  const errorFormatter = typeof opts.errorFormatter === 'function' ? opts.errorFormatter : defaultErrorFormatter

  if (typeof opts.errorHandler === 'function') {
    app.setErrorHandler(opts.errorHandler)
  } else if (opts.errorHandler === true || opts.errorHandler === undefined) {
    app.setErrorHandler((error, _, reply) => {
      const { statusCode, response } = errorFormatter(error)
      reply.code(statusCode).send(response)
    })
  }
  const contextFn = opts.context
  const { subscriptionContextFn } = opts

  const {
    path: graphqlPath = '/graphql',
    subscriber,
    verifyClient,
    onConnect,
    onDisconnect,
    lruGatewayResolvers,
    entityResolversFactory,
    persistedQueryProvider,
    allowBatchedQueries
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

  async function executeQuery (query, variables, operationName, request, reply) {
    // Validate a query is present
    if (!query) {
      return new MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND('Unknown query')
    }

    // Generate the context for this request
    let context = {}
    if (contextFn) {
      context = await contextFn(request, reply)
    }

    // Handle the query, throwing an error if required
    return reply.graphql(query, Object.assign(context, { pubsub: subscriber, __currentQuery: query }), variables, operationName)
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
    handler: async function (request, reply) {
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
      lruGatewayResolvers,
      entityResolversFactory,
      subscriptionContextFn
    })
  } else {
    app.route(getOptions)
  }

  app.addContentTypeParser('application/graphql', { parseAs: 'string' }, function (req, payload, done) {
    done(null, { query: payload })
  })

  app.post(graphqlPath, {
    schema: postSchema(allowBatchedQueries),
    attachValidation: true
  }, async function (request, reply) {
    validationHandler(request.validationError)

    if (allowBatchedQueries && Array.isArray(request.body)) {
      // Batched query
      return Promise.all(request.body.map(r =>
        execute(r, request, reply)
          .catch(e => {
            const { response } = errorFormatter(e)
            return response
          })
      ))
    } else {
      // Regular query
      return execute(request.body, request, reply)
    }
  })

  if (opts.ide || opts.graphiql) {
    app.register(Static, {
      root: join(__dirname, '../static'),
      wildcard: false,
      serve: false
    })

    if (opts.ide === true || opts.ide === 'graphiql' || opts.graphiql === true) {
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
        reply
          .header('Content-Type', 'application/javascript')
          .send(`window.GRAPHQL_ENDPOINT = '${app.prefix}${graphqlPath}'`)
      })
    }
    if (opts.ide === 'playground') {
      const headers = () => {
        const h = opts.playgroundHeaders

        const invoke = `(${/^function|=>/.test(h) ? '' : 'function '}${h})(window);`

        return `const headers = ${typeof h === 'function'
          ? invoke
          : JSON.stringify(h)}`.replace(/\r\n/g, '\n')
      }

      app.get('/playground', (req, reply) => {
        reply.sendFile('playground.html')
      })
      app.get('/playground/init.js', (req, reply) => {
        reply
          .header('Content-Type', 'application/javascript')
          .send(`window.addEventListener('load', function(event) {
  ${headers()}

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '${app.prefix}${graphqlPath}',
    endpoint: '${app.prefix}${graphqlPath}',
    settings: ${JSON.stringify(opts.ideSettings)},
    headers: headers
  });
});`)
      })
    }
  }
}
