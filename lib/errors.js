'use strict'

const { formatError, GraphQLError } = require('graphql')

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

module.exports = {
  FEDERATED_ERROR: FEDERATED_ERROR,
  ErrorWithProps: ErrorWithProps,
  FederatedError: FederatedError,
  toGraphQLError: toGraphQLError,
  defaultErrorFormatter: defaultErrorFormatter
}
