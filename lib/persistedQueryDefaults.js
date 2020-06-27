'use strict'

const crypto = require('crypto')
const LRU = require('tiny-lru')

const persistedQueryDefaults = {
  Prepared: (persistedQueries) => ({
    isPersistedQuery: (r) => r.persisted,
    getHash: (r) => r.query,
    getQueryFromHash: async (hash) => persistedQueries[hash]
  }),
  PreparedOnly: (persistedQueries) => ({
    isPersistedQuery: (r) => true,
    getHash: (r) => r.persisted ? r.query : false, // Only support persisted queries
    getQueryFromHash: async (hash) => persistedQueries[hash]
  }),
  Automatic: (maxSize) => {
    // Initialize a LRU cache in the local scope.
    // LRU is used to prevent DoS attacks.
    const cache = LRU(maxSize || 1024)
    return ({
      isPersistedQuery: (r) => (r.extensions || {}).persistedQuery,
      getHash: (r) => {
        const { version, sha256Hash } = r.extensions.persistedQuery
        return version === 1 ? sha256Hash : false
      },
      getQueryFromHash: async (hash) => cache.get(hash),
      getHashForQuery: (query) => crypto.createHash('sha256').update(query, 'utf8').digest('hex'),
      saveQuery: async (hash, query) => cache.set(hash, query),
      notFoundError: 'PersistedQueryNotFound',
      notSupportedError: 'PersistedQueryNotSupported'
    })
  }
}

module.exports = persistedQueryDefaults
