'use strict'

const lifecycleHooks = ['preParsing', 'preValidation', 'preExecution', 'preGatewayExecution', 'onResolution']
const { MER_ERR_HOOK_INVALID_TYPE, MER_ERR_HOOK_INVALID_HANDLER, MER_ERR_HOOK_UNSUPPORTED_HOOK } = require('./errors')

function Hooks () {
  this.preParsing = []
  this.preValidation = []
  this.preExecution = []
  this.preGatewayExecution = []
  this.onResolution = []
}

Hooks.prototype.validate = function (hook, fn) {
  if (typeof hook !== 'string') throw new MER_ERR_HOOK_INVALID_TYPE()
  if (typeof fn !== 'function') throw new MER_ERR_HOOK_INVALID_HANDLER()
  if (lifecycleHooks.indexOf(hook) === -1) {
    throw new MER_ERR_HOOK_UNSUPPORTED_HOOK(hook)
  }
}

Hooks.prototype.add = function (hook, fn) {
  this.validate(hook, fn)
  this[hook].push(fn)
}

function assignLifeCycleHooksToContext (hooks, context) {
  const contextHooks = {
    preParsing: null,
    preValidation: null,
    preExecution: null,
    preGatewayExecution: null,
    onResolution: null
  }
  if (hooks.preParsing.length > 0) contextHooks.preParsing = hooks.preParsing.slice()
  if (hooks.preValidation.length > 0) contextHooks.preValidation = hooks.preValidation.slice()
  if (hooks.preExecution.length > 0) contextHooks.preExecution = hooks.preExecution.slice()
  if (hooks.preGatewayExecution.length > 0) contextHooks.preGatewayExecution = hooks.preGatewayExecution.slice()
  if (hooks.onResolution.length > 0) contextHooks.onResolution = hooks.onResolution.slice()
  return Object.assign(contextHooks, context)
}

async function hooksRunner (functions, runner, request) {
  for (const fn of functions) {
    await runner(fn, request)
  }
}

async function preExecutionHooksRunner (functions, request) {
  let errors = []
  let modifiedDocument

  for (const fn of functions) {
    const result = await fn(request.schema, modifiedDocument || request.document, request.context)

    if (result) {
      if (typeof result.document !== 'undefined') {
        modifiedDocument = result.document
      }
      if (typeof result.errors !== 'undefined') {
        errors = errors.concat(result.errors)
      }
    }
  }

  return { errors, modifiedDocument }
}

function hookRunner (fn, request) {
  return fn(request.schema, request.document, request.context)
}

function preParsingHookRunner (fn, request) {
  return fn(request.schema, request.source, request.context)
}

function onResolutionHookRunner (fn, request) {
  return fn(request.execution, request.context)
}

module.exports = {
  Hooks,
  assignLifeCycleHooksToContext,
  hooksRunner,
  preExecutionHooksRunner,
  hookRunner,
  preParsingHookRunner,
  onResolutionHookRunner,
  lifecycleHooks
}
