'use strict'

const { hooksRunner, preExecutionHooksRunner, hookRunner, preParsingHookRunner, onResolutionHookRunner, onEndHookRunner } = require('./hooks')
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
    preParsingHookRunner,
    request
  )
}

async function preSubscriptionExecutionHandler (request) {
  await hooksRunner(
    request.context.preSubscriptionExecution,
    hookRunner,
    request
  )
}

async function onSubscriptionResolutionHandler (request) {
  await hooksRunner(
    request.context.onSubscriptionResolution,
    onResolutionHookRunner,
    request
  )
}

async function onSubscriptionEndHandler (request) {
  await hooksRunner(
    request.context.onSubscriptionEnd,
    onEndHookRunner,
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
  onExtendSchemaHandler
}
