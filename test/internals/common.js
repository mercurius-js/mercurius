'use strict'

// Check callback settlement without adding test timers.
exports.mustCall = function mustCall (t, fn, expected = 1) {
  let calls = 0
  t.after(() => t.assert.strictEqual(calls, expected, 'callback invocation count'))
  return (...args) => {
    calls++
    return fn(...args)
  }
}
