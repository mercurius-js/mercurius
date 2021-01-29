const { hooksRunner, preExecutionHooksRunner, hookRunner, preParsingHookRunner, onResolutionHookRunner } = require('./hooks')
const { addErrorsToContext } = require('./errors')
const { print } = require('graphql')

async function preParsingHandler (request) {
  if (request.context.preParsing !== null) {
    await hooksRunner(
      request.context.preParsing,
      preParsingHookRunner,
      request
    )
  }
}

async function preValidationHandler (request) {
  if (request.context.preValidation !== null) {
    await hooksRunner(
      request.context.preValidation,
      hookRunner,
      request
    )
  }
}

async function preExecutionHandler (request) {
  if (request.context.preExecution !== null) {
    const { errors } = await preExecutionHooksRunner(
      request.context.preExecution,
      request
    )
    if (errors.length > 0) {
      addErrorsToContext(request.context, errors)
    }
    if (request.modifiedQuery === true) {
      return { modifiedQuery: print(request.document) }
    }
  }
  return {}
}

async function preGatewayExecutionHandler (request) {
  if (request.context.preGatewayExecution !== null) {
    const { errors } = await preExecutionHooksRunner(
      request.context.preGatewayExecution,
      request
    )
    if (errors.length > 0) {
      addErrorsToContext(request.context, errors)
    }
    if (request.modifiedQuery === true) {
      return { modifiedQuery: print(request.document) }
    }
  }
  return {}
}

async function onResolutionHandler (request) {
  if (request.context.onResolution !== null) {
    await hooksRunner(
      request.context.onResolution,
      onResolutionHookRunner,
      request
    )
  }
}

module.exports = { preParsingHandler, preValidationHandler, preExecutionHandler, preGatewayExecutionHandler, onResolutionHandler }
