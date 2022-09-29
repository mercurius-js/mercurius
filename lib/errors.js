'use strict'

const { GraphQLError } = require('graphql')
const createError = require('@fastify/error')

class ErrorWithProps extends Error {
  constructor (message, extensions, statusCode) {
    super(message)
    this.extensions = extensions
    this.statusCode = statusCode || 200
  }
}

const FEDERATED_ERROR = Symbol('FEDERATED_ERROR')

// a specialized `Error` which extends the `Error` built-in
// to satisfy the `graphql` error handler
class FederatedError extends Error {
  constructor (errors) {
    if (errors && !Array.isArray(errors)) {
      throw new TypeError('errors must be an Array')
    }
    super(FEDERATED_ERROR.toString())
    this.extensions = { errors }
  }
}

// converts an error to a `GraphQLError` compatible
// allows to copy the `path` & `locations` properties
// from the already serialized error
function toGraphQLError (err) {
  if (err instanceof GraphQLError) {
    return err
  }

  const gqlError = new GraphQLError(
    err.message,
    err.nodes,
    err.source,
    err.positions,
    err.path,
    err,
    err.extensions
  )

  gqlError.locations = err.locations

  return gqlError
}

function defaultErrorFormatter (execution, ctx) {
  // There is always app if there is a context
  const log = ctx.reply ? ctx.reply.log : ctx.app.log

  let statusCode = execution.data ? 200 : (execution.statusCode || 200)

  const errors = execution.errors.map((error) => {
    log.info({ err: error }, error.message)

    // parses, converts & combines errors if they are the result of a federated request
    if (error.message === FEDERATED_ERROR.toString() && error.extensions) {
      return error.extensions.errors.map(err => toGraphQLError(err))
    }

    // it handles fastify errors MER_ERR_GQL_VALIDATION
    if (error.originalError?.errors) {
      // not all errors are `GraphQLError` type, we need to convert them
      return error.originalError.errors.map(toGraphQLError)
    }

    return error
    // as the result of the outer map could potentially contain arrays with federated errors
    // the result needs to be flattened
    // and convert error into serializable format
  }).reduce((acc, val) => acc.concat(val), []).map((error) => error.toJSON())

  // Override status code when there is no data or statusCode present
  if (!execution.data && typeof execution.statusCode === 'undefined' && execution.errors.length > 0) {
    if (errors.length === 1) {
      // If single error defined, use status code if present
      if (typeof execution.errors[0].originalError !== 'undefined' && typeof execution.errors[0].originalError.statusCode === 'number') {
        statusCode = execution.errors[0].originalError.statusCode
        // Otherwise, use 200 as per graphql-over-http spec
      } else {
        statusCode = 200
      }
    }
  }

  return {
    statusCode,
    response: {
      data: execution.data || null,
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
    execution.errors = newErrors.map((error) => toGraphQLError(error))
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
  MER_ERR_GQL_GATEWAY_DUPLICATE_DIRECTIVE: createError(
    'MER_ERR_GQL_GATEWAY_DUPLICATE_DIRECTIVE',
    'Directive with a different definition but the same name "%s" already exists in the gateway schema'
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
  MER_ERR_GQL_SUBSCRIPTION_INVALID_OPERATION: createError(
    'MER_ERR_GQL_SUBSCRIPTION_INVALID_OPERATION',
    'Invalid operation: %s'
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
  ),
  MER_ERR_SERVICE_RETRY_FAILED: createError(
    'MER_ERR_SERVICE_RETRY_FAILED',
    'Mandatory services retry failed - [%s]',
    500
  )
}

module.exports = errors
module.exports.ErrorWithProps = ErrorWithProps
module.exports.FederatedError = FederatedError
module.exports.defaultErrorFormatter = defaultErrorFormatter
module.exports.addErrorsToExecutionResult = addErrorsToExecutionResult
module.exports.addErrorsToContext = addErrorsToContext
module.exports.toGraphQLError = toGraphQLError
