'use strict'

const { hooksRunner, preExecutionHooksRunner, hookRunner, preParsingHookRunner, onResolutionHookRunner } = require('./hooks')
const { addErrorsToContext } = require('./errors')
const { print } = require('graphql')

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
  const { errors, modifiedDocument } = await preExecutionHooksRunner(
    request.context.preExecution,
    request
  )
  if (errors.length > 0) {
    addErrorsToContext(request.context, errors)
  }
  if (typeof modifiedDocument !== 'undefined') {
    return { modifiedDocument, modifiedQuery: print(request.document) }
  }
  return {}
}

async function preGatewayExecutionHandler (request) {
  const { errors, modifiedDocument } = await preExecutionHooksRunner(
    request.context.preGatewayExecution,
    request
  )
  if (errors.length > 0) {
    addErrorsToContext(request.context, errors)
  }
  if (typeof modifiedDocument !== 'undefined') {
    return { modifiedDocument, modifiedQuery: print(modifiedDocument) }
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

async function preGatewaySubscriptionExecutionHandler (request) {
  await hooksRunner(
    request.context.preGatewaySubscriptionExecution,
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

module.exports = {
  preParsingHandler,
  preValidationHandler,
  preExecutionHandler,
  preGatewayExecutionHandler,
  onResolutionHandler,
  preSubscriptionParsingHandler,
  preSubscriptionExecutionHandler,
  preGatewaySubscriptionExecutionHandler,
  onSubscriptionResolutionHandler
}
