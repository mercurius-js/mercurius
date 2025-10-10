'use strict'

const {
  hooksRunner, preExecutionHooksRunner, hookRunner, preParsingHookRunner, onResolutionHookRunner,
  preSubscriptionParsingHookRunner, preSubscriptionExecutionHookRunner, onSubscriptionResolutionHookRunner, onSubscriptionEndHookRunner, onConnectionCloseHookRunner, onConnectionErrorHookRunner
} = require('./hooks')
const { addErrorsToContext } = require('./errors')

async function preParsingHandler (request) {
  await hooksRunner(
    request.context.preParsing,
    preParsingHookRunner,
    request
  )
}

async function preValidationHandler (request) {
  await hooksRunner(
    request.context.preValidation,
    hookRunner,
    request
  )
}

async function preExecutionHandler (request) {
  const {
    errors,
    modifiedDocument,
    modifiedSchema,
    modifiedVariables
  } = await preExecutionHooksRunner(
    request.context.preExecution,
    request
  )

  if (errors.length > 0) {
    addErrorsToContext(request.context, errors)
  }
  if (
    typeof modifiedDocument !== 'undefined' ||
    typeof modifiedSchema !== 'undefined' ||
    typeof modifiedVariables !== 'undefined'
  ) {
    return Object.create(null, {
      modifiedDocument: { value: modifiedDocument },
      modifiedSchema: { value: modifiedSchema },
      modifiedVariables: { value: modifiedVariables }
    })
  }

  return {}
}

async function onResolutionHandler (request) {
  await hooksRunner(
    request.context.onResolution,
    onResolutionHookRunner,
    request
  )
}

async function preSubscriptionParsingHandler (request) {
  await hooksRunner(
    request.context.preSubscriptionParsing,
    preSubscriptionParsingHookRunner,
    request
  )
}

async function preSubscriptionExecutionHandler (request) {
  await hooksRunner(
    request.context.preSubscriptionExecution,
    preSubscriptionExecutionHookRunner,
    request
  )
}

async function onSubscriptionResolutionHandler (request) {
  await hooksRunner(
    request.context.onSubscriptionResolution,
    onSubscriptionResolutionHookRunner,
    request
  )
}

async function onSubscriptionEndHandler (request) {
  await hooksRunner(
    request.context.onSubscriptionEnd,
    onSubscriptionEndHookRunner,
    request
  )
}

async function onSubscriptionConnectionCloseHandler (request) {
  await hooksRunner(
    request.context.onSubscriptionConnectionClose,
    onConnectionCloseHookRunner,
    request
  )
  /* c8 ignore next 1 something wrong with coverage */
}

async function onSubscriptionConnectionErrorHandler (request) {
  await hooksRunner(
    request.context.onSubscriptionConnectionError,
    onConnectionErrorHookRunner,
    request
  )
}

async function onExtendSchemaHandler (request) {
  await hooksRunner(
    request.context.onExtendSchema,
    hookRunner,
    request
  )
}

module.exports = {
  preParsingHandler,
  preValidationHandler,
  preExecutionHandler,
  onResolutionHandler,
  preSubscriptionParsingHandler,
  preSubscriptionExecutionHandler,
  onSubscriptionResolutionHandler,
  onSubscriptionEndHandler,
  onSubscriptionConnectionCloseHandler,
  onSubscriptionConnectionErrorHandler,
  onExtendSchemaHandler
}
