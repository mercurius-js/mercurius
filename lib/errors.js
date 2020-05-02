'use strict'

class ErrorWithProps extends Error {
  constructor (message, code, additionalProperties) {
    super(message)
    this.code = code
    this.additionalProperties = additionalProperties
  }
}

module.exports = {
  ErrorWithProps: ErrorWithProps
}
