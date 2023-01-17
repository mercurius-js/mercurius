'use strict'

const crypto = require('crypto')
const LRU = require('tiny-lru').lru

const persistedQueryDefaults = {
  prepared: (persistedQueries) => ({
    isPersistedQuery: (request) => request.persisted,
    getHash: (request) => request.query,
    getQueryFromHash: async (hash) => persistedQueries[hash]
  }),
  preparedOnly: (persistedQueries) => ({
    isPersistedQuery: (request) => true,
    getHash: (request) => request.persisted ? request.query : false, // Only support persisted queries
    getQueryFromHash: async (hash) => persistedQueries[hash]
  }),
  automatic: (maxSize) => {
    // Initialize a LRU cache in the local scope.
    // LRU is used to prevent DoS attacks.
    const cache = LRU(maxSize || 1024)
    return ({
      isPersistedQuery: (request) => !request.query && (request.extensions || {}).persistedQuery,
      getHash: (request) => {
        const { version, sha256Hash } = request.extensions.persistedQuery
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
