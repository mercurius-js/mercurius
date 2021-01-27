'use strict'

const lifecycleHooks = ['preParsing', 'preValidation', 'preExecution', 'onResolution']
const supportedHooks = lifecycleHooks
const { MER_ERR_HOOK_INVALID_TYPE, MER_ERR_HOOK_INVALID_HANDLER, MER_ERR_HOOK_UNSUPPORTED_HOOK } = require('./errors')

function Hooks () {
  this.preParsing = []
  this.preValidation = []
  this.preExecution = []
  this.onResolution = []
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

function assignLifeCycleHooksToContext (hooks, context) {
  const contextHooks = {
    preParsing: null,
    preValidation: null,
    preExecution: null,
    onResolution: null
  }
  if (hooks.preParsing.length > 0) contextHooks.preParsing = hooks.preParsing.slice()
  if (hooks.preValidation.length > 0) contextHooks.preValidation = hooks.preValidation.slice()
  if (hooks.preExecution.length > 0) contextHooks.preExecution = hooks.preExecution.slice()
  if (hooks.onResolution.length > 0) contextHooks.onResolution = hooks.onResolution.slice()
  return Object.assign(contextHooks, context)
}

async function hookRunner (functions, runner, request, cb) {
  let i = 0

  async function next (err) {
    // If finished, call the handler callback
    if (err || i === functions.length) {
      cb(err, request)
      return
    }

    let result
    try {
      result = runner(functions[i++], request, next)
    } catch (error) {
      next(error)
      return
    }
    if (result && typeof result.then === 'function') {
      await result.then(handleResolve, handleReject)
    }
  }

  async function handleResolve () {
    await next()
  }

  function handleReject (err) {
    cb(err, request)
  }

  await next()
}

async function preExecutionHookRunner (functions, request, executionResult, cb) {
  let i = 0

  async function next (err, newDocument, newErrors) {
    // If finished, call the handler callback
    if (err) {
      cb(err, request, executionResult)
      return
    }

    if (newDocument !== undefined) {
      request.document = newDocument
    }

    if (newErrors !== undefined) {
      if (executionResult.errors !== undefined) {
        executionResult.errors = executionResult.errors.concat(newErrors)
      } else {
        executionResult.errors = newErrors
      }
    }

    if (i === functions.length) {
      cb(null, request, executionResult)
      return
    }

    let result
    try {
      result = functions[i++](request.schema, request.document, request.context)
    } catch (error) {
      await next(error)
      return
    }
    if (result && typeof result.then === 'function') {
      await result.then(handleResolve, handleReject)
    } else {
      await handleResolve(result)
    }
  }

  async function handleResolve (result) {
    let newDocument
    let newErrors
    if (result) {
      if (typeof result.document !== 'undefined') {
        newDocument = result.document
      }
      if (typeof result.errors !== 'undefined') {
        newErrors = result.errors
      }
    }
    await next(null, newDocument, newErrors)
  }

  function handleReject (err) {
    cb(err, request, executionResult)
  }

  await next()
}

function hookIterator (fn, request, next) {
  return fn(request, next)
}

module.exports = {
  Hooks,
  assignLifeCycleHooksToContext,
  hookRunner,
  preExecutionHookRunner,
  hookIterator,
  lifecycleHooks
}
