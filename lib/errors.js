'use strict'

class FastifyGraphQLError extends Error {
  constructor (message, code, additionalProperties) {
    super(message)
    this.code = code
    this.additionalProperties = additionalProperties
  }
}

module.exports = {
  FastifyGraphQLError: FastifyGraphQLError
}
