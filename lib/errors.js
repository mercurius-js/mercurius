'use strict'

const { GraphQLError } = require('graphql')

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

module.exports = {
  FEDERATED_ERROR: FEDERATED_ERROR,
  ErrorWithProps: ErrorWithProps,
  FederatedError: FederatedError,
  toGraphQLError: toGraphQLError
}
