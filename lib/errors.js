'use strict'

class ErrorWithProps extends Error {
  constructor (message, extensions) {
    super(message)
    this.extensions = extensions
  }
}

module.exports = {
  ErrorWithProps: ErrorWithProps
}
