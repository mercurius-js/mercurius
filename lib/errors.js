const { GraphQLError } = require('graphql')

class FastifyGraphQLError extends GraphQLError {
  constructor (message, code, additionalProperties) {
    super(message)
    this.code = code
    this.additionalProperties = additionalProperties
  }
}

module.exports = {
  FastifyGraphQLError: FastifyGraphQLError
}
