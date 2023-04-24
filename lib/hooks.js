'use strict'

const applicationHooks = [
  'onExtendSchema'
]

const lifecycleHooks = [
  'preParsing',
  'preValidation',
  'preExecution',
  'onResolution',
  'preSubscriptionParsing',
  'preSubscriptionExecution',
  'onSubscriptionResolution',
  'onSubscriptionEnd'
]
const supportedHooks = lifecycleHooks.concat(applicationHooks)
const { MER_ERR_HOOK_INVALID_TYPE, MER_ERR_HOOK_INVALID_HANDLER, MER_ERR_HOOK_UNSUPPORTED_HOOK } = require('./errors')

function Hooks () {
  this.preParsing = []
  this.preValidation = []
  this.preExecution = []
  this.onResolution = []
  this.preSubscriptionParsing = []
  this.preSubscriptionExecution = []
  this.onSubscriptionResolution = []
  this.onSubscriptionEnd = []
  this.onExtendSchema = []
}

Hooks.prototype.validate = function (hook, fn) {
  if (typeof hook !== 'string') throw new MER_ERR_HOOK_INVALID_TYPE()
  if (typeof fn !== 'function') throw new MER_ERR_HOOK_INVALID_HANDLER()
  if (supportedHooks.indexOf(hook) === -1) {
    throw new MER_ERR_HOOK_UNSUPPORTED_HOOK(hook)
  }
}

Hooks.prototype.add = function (hook, fn) {
  this.validate(hook, fn)
  this[hook].push(fn)
}

function assignLifeCycleHooksToContext (context, hooks) {
  const contextHooks = {
    preParsing: null,
    preValidation: null,
    preExecution: null,
    onResolution: null,
    preSubscriptionParsing: null,
    preSubscriptionExecution: null,
    onSubscriptionResolution: null,
    onSubscriptionEnd: null
  }
  if (hooks.preParsing.length > 0) contextHooks.preParsing = hooks.preParsing.slice()
  if (hooks.preValidation.length > 0) contextHooks.preValidation = hooks.preValidation.slice()
  if (hooks.preExecution.length > 0) contextHooks.preExecution = hooks.preExecution.slice()
  if (hooks.onResolution.length > 0) contextHooks.onResolution = hooks.onResolution.slice()
  if (hooks.preSubscriptionParsing.length > 0) contextHooks.preSubscriptionParsing = hooks.preSubscriptionParsing.slice()
  if (hooks.preSubscriptionExecution.length > 0) contextHooks.preSubscriptionExecution = hooks.preSubscriptionExecution.slice()
  if (hooks.onSubscriptionResolution.length > 0) contextHooks.onSubscriptionResolution = hooks.onSubscriptionResolution.slice()
  if (hooks.onSubscriptionEnd.length > 0) contextHooks.onSubscriptionEnd = hooks.onSubscriptionEnd.slice()
  return Object.assign(context, contextHooks)
}

function assignApplicationHooksToContext (context, hooks) {
  const contextHooks = {
    onExtendSchema: null
  }
  if (hooks.onExtendSchema.length > 0) contextHooks.onExtendSchema = hooks.onExtendSchema.slice()
  return Object.assign(context, contextHooks)
}

async function hooksRunner (functions, runner, request) {
  for (const fn of functions) {
    await runner(fn, request)
  }
}

async function preExecutionHooksRunner (functions, request) {
  let errors = []
  let modifiedSchema
  let modifiedDocument
  let modifiedVariables

  for (const fn of functions) {
    const result = await fn(
      modifiedSchema || request.schema,
      modifiedDocument || request.document,
      request.context,
      modifiedVariables || request.variables
    )

    if (result) {
      if (typeof result.schema !== 'undefined') {
        modifiedSchema = result.schema
      }
      if (typeof result.document !== 'undefined') {
        modifiedDocument = result.document
      }
      if (typeof result.variables !== 'undefined') {
        modifiedVariables = result.variables
      }
      if (typeof result.errors !== 'undefined') {
        errors = errors.concat(result.errors)
      }
    }
  }

  return { errors, modifiedDocument, modifiedSchema, modifiedVariables }
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

function onEndHookRunner (fn, request) {
  return fn(request.context, request.id)
}

module.exports = {
  Hooks,
  assignLifeCycleHooksToContext,
  assignApplicationHooksToContext,
  hooksRunner,
  preExecutionHooksRunner,
  hookRunner,
  preParsingHookRunner,
  onResolutionHookRunner,
  onEndHookRunner
}
