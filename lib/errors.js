'use strict'

const { formatError, GraphQLError } = require('graphql')
const createError = require('fastify-error')

class ErrorWithProps extends Error {
  constructor (message, extensions) {
    super(message)
    this.extensions = extensions
  }
}

const FEDERATED_ERROR = Symbol('FEDERATED_ERROR')

// a specialized `Error` which extends the `Error` built-in
// to satisfy the `graphql` error handler
class FederatedError extends Error {
  constructor (errors) {
    super(FEDERATED_ERROR.toString())
    this.extensions = { errors }
  }
}

// converts an error to a `GraphQLError` compatible
// allows to copy the `path` & `locations` properties
// from the already serialized error
function toGraphQLError (err) {
  return Object.create(GraphQLError, {
    name: {
      value: err.name
    },
    message: {
      value: err.message,
      enumerable: true,
      writable: true
    },
    locations: {
      value: err.locations || undefined,
      enumerable: true
    },
    path: {
      value: err.path || undefined,
      enumerable: true
    },
    nodes: {
      value: err.nodes || undefined
    },
    source: {
      value: err.source || undefined
    },
    positions: {
      value: err.positions || undefined
    },
    originalError: {
      value: err.originalError || undefined
    },
    extensions: {
      value: err.extensions || undefined
    }
  })
}

function defaultErrorFormatter (err, ctx) {
  let errors = [{ message: err.message }]
  let log

  if (ctx) {
    // There is always app if there is a context
    log = ctx.reply ? ctx.reply.log : ctx.app.log
  }

  if (err.errors) {
    errors = err.errors.map((error, idx) => {
      if (log) {
        log.error({ err: error }, error.message)
      }
      // parses, converts & combines errors if they are the result of a federated request
      if (error.message === FEDERATED_ERROR.toString()) {
        return error.extensions.errors.map(err => formatError(toGraphQLError(err)))
      }
      return error instanceof GraphQLError ? formatError(error) : { message: error.message }
      // as the result of the outer map could potentially contain arrays with federated errors
      // the result needs to be flattened
    }).reduce((acc, val) => acc.concat(val), [])
  }

  return {
    statusCode: err.data ? 200 : /* istanbul ignore next */ (err.statusCode || 500),
    response: {
      data: err.data || null,
      errors
    }
  }
}

function addErrorsToExecutionResult (execution, errors) {
  if (errors) {
    let newErrors
    if (execution.errors) {
      newErrors = execution.errors.concat(errors)
    } else {
      newErrors = errors
    }
    execution.errors = newErrors
  }
  return execution
}

function addErrorsToContext (context, errors) {
  let newErrors
  if (context.errors !== null) {
    newErrors = context.errors.concat(errors)
  } else {
    newErrors = errors
  }

  context.errors = newErrors
}

const errors = {
  /**
   * General errors
   */
  MER_ERR_INVALID_OPTS: createError(
    'MER_ERR_INVALID_OPTS',
    'Invalid options: %s'
  ),
  MER_ERR_INVALID_METHOD: createError(
    'MER_ERR_INVALID_METHOD',
    'Invalid method: %s'
  ),
  MER_ERR_METHOD_NOT_ALLOWED: createError(
    'MER_ERR_METHOD_NOT_ALLOWED',
    'Method not allowed',
    405
  ),
  /**
   * General graphql errors
   */
  MER_ERR_GQL_INVALID_SCHEMA: createError(
    'MER_ERR_GQL_INVALID_SCHEMA',
    'Invalid schema: check out the .errors property on the Error'
  ),
  MER_ERR_GQL_VALIDATION: createError(
    'MER_ERR_GQL_VALIDATION',
    'Graphql validation error',
    400
  ),
  MER_ERR_GQL_QUERY_DEPTH: createError(
    'MER_ERR_GQL_QUERY_DEPTH',
    '`%s query depth (%s) exceeds the query depth limit of %s`'
  ),
  /**
   * Gateway errors
   */
  MER_ERR_GQL_GATEWAY: createError(
    'MER_ERR_GQL_GATEWAY',
    'Gateway issues: %s'
  ),
  MER_ERR_GQL_GATEWAY_INVALID_SCHEMA: createError(
    'MER_ERR_GQL_GATEWAY_INVALID_SCHEMA',
    'The _entities resolver tried to load an entity for type "%s", but no object type of that name was found in the schema'
  ),
  MER_ERR_GQL_GATEWAY_REFRESH: createError(
    'MER_ERR_GQL_GATEWAY_REFRESH',
    'Refresh schema issues'
  ),
  MER_ERR_GQL_GATEWAY_INIT: createError(
    'MER_ERR_GQL_GATEWAY_INIT',
    'Gateway schema init issues'
  ),
  MER_ERR_GQL_GATEWAY_MISSING_KEY_DIRECTIVE: createError(
    'MER_ERR_GQL_GATEWAY_MISSING_KEY_DIRECTIVE',
    'Missing @key directive in %s type'
  ),
  /**
   * Persisted query errors
   */
  MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND: createError(
    'MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND',
    '%s',
    400
  ),
  MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED: createError(
    'MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED',
    '%s',
    400
  ),
  /**
   * Subscription errors
   */
  MER_ERR_GQL_SUBSCRIPTION_CONNECTION_NOT_READY: createError(
    'MER_ERR_GQL_SUBSCRIPTION_CONNECTION_NOT_READY',
    'Connection is not ready'
  ),
  MER_ERR_GQL_SUBSCRIPTION_FORBIDDEN: createError(
    'MER_ERR_GQL_SUBSCRIPTION_FORBIDDEN',
    'Forbidden'
  ),
  MER_ERR_GQL_SUBSCRIPTION_UNKNOWN_EXTENSION: createError(
    'MER_ERR_GQL_SUBSCRIPTION_UNKNOWN_EXTENSION',
    'Unknown extension %s'
  ),
  MER_ERR_GQL_SUBSCRIPTION_MESSAGE_INVALID: createError(
    'MER_ERR_GQL_SUBSCRIPTION_MESSAGE_INVALID',
    'Invalid message received: %s'
  ),
  /**
   * Hooks errors
   */
  MER_ERR_HOOK_INVALID_TYPE: createError(
    'MER_ERR_HOOK_INVALID_TYPE',
    'The hook name must be a string',
    500,
    TypeError
  ),
  MER_ERR_HOOK_INVALID_HANDLER: createError(
    'MER_ERR_HOOK_INVALID_HANDLER',
    'The hook callback must be a function',
    500,
    TypeError
  ),
  MER_ERR_HOOK_UNSUPPORTED_HOOK: createError(
    'MER_ERR_HOOK_UNSUPPORTED_HOOK',
    '%s hook not supported!',
    500
  )
}

module.exports = errors
module.exports.ErrorWithProps = ErrorWithProps
module.exports.FederatedError = FederatedError
module.exports.defaultErrorFormatter = defaultErrorFormatter
module.exports.addErrorsToExecutionResult = addErrorsToExecutionResult
module.exports.addErrorsToContext = addErrorsToContext
