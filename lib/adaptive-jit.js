'use strict'

const { performance } = require('node:perf_hooks')

function createAdaptiveJit ({ getSchema, compileQuery, compilerOptions, minCount, eluThreshold, maxCompilePerTick, maxQueueSize }) {
  const queue = []
  let compiling = false
  let generation = 0
  let elu = performance.eventLoopUtilization()
  let immediateHandle = null
  let timeoutHandle = null

  function clearQueuedState (cached) {
    cached.jitQueued = false
    cached.jitQueueEntry = null
  }

  function insertEntry (entry) {
    let index = queue.findIndex((current) => current.cached.count < entry.cached.count)
    if (index === -1) {
      index = queue.length
    }

    queue.splice(index, 0, entry)
  }

  function rescheduleEntry (entry) {
    const index = queue.indexOf(entry)
    if (index !== -1) {
      queue.splice(index, 1)
    }

    insertEntry(entry)
  }

  function getELU () {
    const next = performance.eventLoopUtilization(elu)
    elu = performance.eventLoopUtilization()
    return next.utilization
  }

  function clearScheduledCompilation () {
    if (immediateHandle !== null) {
      clearImmediate(immediateHandle)
      immediateHandle = null
    }

    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  function scheduleImmediate (token) {
    if (immediateHandle !== null) {
      return
    }

    immediateHandle = setImmediate(() => {
      immediateHandle = null
      compileTick(token)
    })

    immediateHandle.unref && immediateHandle.unref()
  }

  function scheduleTimeout (token) {
    if (timeoutHandle !== null) {
      return
    }

    timeoutHandle = setTimeout(() => {
      timeoutHandle = null
      compileTick(token)
    }, 50)

    timeoutHandle.unref && timeoutHandle.unref()
  }

  function compileTick (token) {
    if (token !== generation) {
      return
    }

    if (queue.length === 0) {
      compiling = false
      return
    }

    if (getELU() >= eluThreshold) {
      scheduleTimeout(token)
      return
    }

    let compiled = 0
    while (queue.length > 0 && compiled < maxCompilePerTick) {
      const entry = queue.shift()
      const { cached, document, operationName } = entry

      clearQueuedState(cached)

      if (cached.jit !== null) {
        continue
      }

      try {
        cached.jit = compileQuery(getSchema(), document, operationName, compilerOptions)
      } catch (err) {
        cached.jit = err
      }

      compiled++
    }

    if (queue.length > 0) {
      scheduleImmediate(token)
      return
    }

    compiling = false
  }

  function scheduleCompilation () {
    if (compiling || queue.length === 0) {
      return
    }

    compiling = true
    const token = generation
    scheduleImmediate(token)
  }

  function enqueue (cached, document, operationName) {
    if (cached.jit !== null) {
      return
    }

    if (cached.jitQueued) {
      const entry = cached.jitQueueEntry
      entry.document = document
      entry.operationName = operationName
      rescheduleEntry(entry)
      return
    }

    const entry = { cached, document, operationName }
    cached.jitQueued = true
    cached.jitQueueEntry = entry
    insertEntry(entry)

    if (queue.length > maxQueueSize) {
      const dropped = queue.pop()
      clearQueuedState(dropped.cached)
    }

    scheduleCompilation()
  }

  function maybeEnqueue (cached, document, operationName) {
    if (!cached || cached.jit !== null || cached.count < minCount) {
      return
    }

    enqueue(cached, document, operationName)
  }

  function clear () {
    generation++
    compiling = false
    elu = performance.eventLoopUtilization()
    clearScheduledCompilation()

    while (queue.length > 0) {
      const entry = queue.shift()
      clearQueuedState(entry.cached)
    }
  }

  return {
    maybeEnqueue,
    clear
  }
}

module.exports = createAdaptiveJit
