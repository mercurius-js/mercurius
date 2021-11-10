'use strict'

const { hooksRunner, preExecutionHooksRunner, preGatewayExecutionHooksRunner, gatewayHookRunner, hookRunner, preParsingHookRunner, onResolutionHookRunner, onEndHookRunner, onGatewayReplaceSchemaHookRunner } = require('./hooks')
const { addErrorsToContext } = require('./errors')
const { print } = require('graphql')

async function onGatewayReplaceSchemaHandler (context, data) {
  await hooksRunner(
    context.onGatewayReplaceSchema,
    onGatewayReplaceSchemaHookRunner,
    data
  )
}

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
  const { errors, modifiedDocument, modifiedSchema } = await preExecutionHooksRunner(
    request.context.preExecution,
    request
  )
  if (errors.length > 0) {
    addErrorsToContext(request.context, errors)
  }
  if (typeof modifiedDocument !== 'undefined' || typeof modifiedSchema !== 'undefined') {
    return Object.create(null, {
      modifiedDocument: { value: modifiedDocument },
      modifiedSchema: { value: modifiedSchema }
    })
  }

  return {}
}

async function preGatewayExecutionHandler (request) {
  const { errors, modifiedDocument } = await preGatewayExecutionHooksRunner(
    request.context.preGatewayExecution,
    request
  )
  if (errors.length > 0) {
    addErrorsToContext(request.context, errors)
  }
  if (typeof modifiedDocument !== 'undefined') {
    return Object.create(null, {
      modifiedDocument: { value: modifiedDocument },
      modifiedQuery: { get: () => print(modifiedDocument) }
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

async function preGatewaySubscriptionExecutionHandler (request) {
  await hooksRunner(
    request.context.preGatewaySubscriptionExecution,
    gatewayHookRunner,
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

module.exports = {
  preParsingHandler,
  preValidationHandler,
  preExecutionHandler,
  preGatewayExecutionHandler,
  onResolutionHandler,
  preSubscriptionParsingHandler,
  preSubscriptionExecutionHandler,
  preGatewaySubscriptionExecutionHandler,
  onSubscriptionResolutionHandler,
  onSubscriptionEndHandler,
  onGatewayReplaceSchemaHandler
}
