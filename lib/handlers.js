const { hookRunner, preExecutionHookRunner, hookIterator } = require('./hooks')
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

function onResolutionCallback (err, request) {
  if (err != null) {
    throw err
  }
}

async function preParsingHandler (source, context, variables, operationName) {
  if (context.preParsing !== null) {
    await hookRunner(
      context.preParsing,
      hookIterator,
      { source, context, variables, operationName },
      preParsingCallback
    )
  } else {
    preParsingCallback(null, { source, context, variables, operationName })
  }
}

async function preValidationHandler (document, context, variables, operationName) {
  if (context.preValidation !== null) {
    await hookRunner(
      context.preValidation,
      hookIterator,
      { document, context, variables, operationName },
      preValidationCallback
    )
  } else {
    preValidationCallback(null, { document, context, variables, operationName })
  }
}

async function preExecutionHandler (request) {
  const executionResult = {}
  // TODO: make this null for subscriptions
  if (request.context && request.context.preExecution != null) {
    await preExecutionHookRunner(
      request.context.preExecution,
      request,
      // TODO: remove this
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

async function onResolutionHandler (execution, context) {
  if (context.onResolution != null) {
    await hookRunner(
      context.onResolution,
      hookIterator,
      { execution, context },
      onResolutionCallback
    )
  } else {
    return onResolutionCallback(null, { execution, context })
  }
}

module.exports = { preParsingHandler, preValidationHandler, preExecutionHandler, onResolutionHandler }