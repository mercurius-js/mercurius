const crypto = require('crypto')

const PersistedQueryDefaults = {
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
  Automatic: () => {
    // Initialize only in the scope of this server instance
    const AUTOMATIC_PERSISTED_QUERIES = {}
    return ({
      isPersistedQuery: (r) => (r.extensions || {}).persistedQuery,
      getHash: (r) => {
        const { version, sha256Hash } = r.extensions.persistedQuery
        return version === 1 ? sha256Hash : false
      },
      getQueryFromHash: async (hash) => AUTOMATIC_PERSISTED_QUERIES[hash],
      getHashForQuery: (query) => crypto.createHash('sha256').update(query, 'utf8').digest('hex'),
      saveQuery: async (hash, query) => { AUTOMATIC_PERSISTED_QUERIES[hash] = query },
      notFoundError: 'PersistedQueryNotFound',
      notSupportedError: 'PersistedQueryNotSupported'
    })
  }
}

module.exports = PersistedQueryDefaults
