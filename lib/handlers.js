const { hookRunner, preExecutionHookRunner, hookIterator, preParsingHookIterator, onResolutionHookIterator } = require('./hooks')
const { addErrorsToContext } = require('./errors')
const { print } = require('graphql')

function preParsingCallback (err, request) {
  if (err != null) {
    throw err
  }
}

function preValidationCallback (err, request) {
  if (err != null) {
    throw err
  }
}

function preExecutionCallback (err, request, executionResult) {
  if (err != null) {
    throw err
  }
  return {}
}

function preGatewayExecutionCallback (err, request, executionResult) {
  if (err != null) {
    throw err
  }
  return {}
}

function onResolutionCallback (err, request) {
  if (err != null) {
    throw err
  }
}

async function preParsingHandler (request) {
  if (request.context.preParsing !== null) {
    await hookRunner(
      request.context.preParsing,
      preParsingHookIterator,
      request,
      preParsingCallback
    )
  } else {
    preParsingCallback(null, request)
  }
}

async function preValidationHandler (request) {
  if (request.context.preValidation !== null) {
    await hookRunner(
      request.context.preValidation,
      hookIterator,
      request,
      preValidationCallback
    )
  } else {
    preValidationCallback(null, request)
  }
}

async function preExecutionHandler (request) {
  const executionResult = {}
  // TODO: make this null for subscriptions
  if (request.context && request.context.preExecution != null) {
    await preExecutionHookRunner(
      request.context.preExecution,
      request,
      executionResult,
      preExecutionCallback
    )
    if (executionResult.errors) {
      addErrorsToContext(request.context, executionResult.errors)
    }
    // TODO: don't parse if necessary
    return { modifiedQuery: print(request.document) }
  } else {
    return preExecutionCallback(null, request, executionResult)
  }
}

async function preGatewayExecutionHandler (request) {
  const executionResult = {}
  // TODO: make this null for subscriptions
  if (request.context && request.context.preGatewayExecution != null) {
    await preExecutionHookRunner(
      request.context.preGatewayExecution,
      request,
      executionResult,
      preGatewayExecutionCallback
    )
    if (executionResult.errors) {
      addErrorsToContext(request.context, executionResult.errors)
    }
    // TODO: don't parse if necessary
    return { modifiedQuery: print(request.document) }
  } else {
    return preGatewayExecutionCallback(null, request, executionResult)
  }
}

async function onResolutionHandler (request) {
  if (request.context.onResolution != null) {
    await hookRunner(
      request.context.onResolution,
      onResolutionHookIterator,
      request,
      onResolutionCallback
    )
  } else {
    return onResolutionCallback(null, request)
  }
}

module.exports = { preParsingHandler, preValidationHandler, preExecutionHandler, preGatewayExecutionHandler, onResolutionHandler }
