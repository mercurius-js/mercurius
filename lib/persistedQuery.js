const {
  MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND,
  MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED
} = require('./errors')

exports.createPersistedQueryExecutor = function createPersistedQueryExecutor (
  provider,
  defaultExecutor
) {
  const {
    isPersistedQuery,
    getHash,
    getQueryFromHash,
    getHashForQuery,
    saveQuery,
    notFoundError,
    notSupportedError
  } = provider

  return async (body, request, reply) => {
    let { query } = body
    const { operationName, variables } = body

    // Verify if a query matches the persisted format
    const persisted = isPersistedQuery(body)
    if (persisted) {
      // This is a peristed query, so we use the hash in the request
      // to load the full query string.

      // Extract the hash from the request
      const hash = getHash && getHash(body)
      if (hash) {
        // Load the query for the provided hash
        query = await getQueryFromHash(hash)

        if (!query) {
          // Query has not been found, tell the client
          throw new MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND(notFoundError)
        }

        // The query has now been set to the full query string
      } else {
        // This client should stop sending persisted queries,
        // as we do not recognise them
        throw new MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED(notSupportedError)
      }
    }

    // Execute the query
    const result = await defaultExecutor(
      query,
      variables,
      operationName,
      request,
      reply
    )

    // Only save queries which are not yet persisted
    if (!persisted && query) {
      // If provided the getHashForQuery, saveQuery settings we save this query
      const hash = getHashForQuery && getHashForQuery(query)
      if (hash) {
        try {
          await saveQuery(hash, query)
        } catch (err) {
          request.log.warn({ err, hash, query }, 'Failed to persist query')
        }
      }
    }

    // Return the result
    return result
  }
}
