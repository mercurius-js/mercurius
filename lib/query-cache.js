'use strict'

// An LRU cache bounded both by the number of entries and by the total size
// of its keys. The keys are GraphQL query strings, and the parsed document
// of a query can be several hundred times larger than its text, so an
// entry-count bound alone does not bound memory usage.
class QueryCache {
  constructor ({ maxEntries, maxSize }) {
    this.maxEntries = maxEntries
    this.maxSize = maxSize
    this.size = 0
    this.map = new Map()
  }

  get (key) {
    const entry = this.map.get(key)
    if (entry === undefined) {
      return undefined
    }
    // Move the entry to the most recently used position
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set (key, value) {
    const weight = weightOf(key)
    this.delete(key)

    if (weight > this.maxSize) {
      return
    }

    this.map.set(key, { value, weight })
    this.size += weight

    while (this.map.size > this.maxEntries || this.size > this.maxSize) {
      this.delete(this.map.keys().next().value)
    }
  }

  delete (key) {
    const entry = this.map.get(key)
    if (entry !== undefined) {
      this.map.delete(key)
      this.size -= entry.weight
    }
  }

  clear () {
    this.map.clear()
    this.size = 0
  }
}

function weightOf (key) {
  // Documents passed as objects come from server-side code via
  // app.graphql(), so they are only bounded by the number of entries.
  return typeof key === 'string' ? key.length : 0
}

module.exports = QueryCache
