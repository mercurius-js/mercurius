'use strict'

const { preGatewayExecutionHandler } = require('../handlers')

/**
 * @typedef {Object.<string, { variables: Object, document: import('graphql').DocumentNode }>} GroupedQueries
 */

/**
 * Group GraphQL queries by their string and map them to their variables and document.
 * @param {Array} queries
 * @returns {GroupedQueries}
 */
function groupQueriesByDefinition (queries) {
  const q = [...new Set(queries.map(q => q.query))]
  const resultIndexes = []
  const mergedQueries = queries.reduce((acc, curr, queryIndex) => {
    if (!acc[curr.query]) {
      acc[curr.query] = {
        document: curr.document,
        variables: curr.variables
      }
      resultIndexes[q.indexOf(curr.query)] = []
    } else {
      acc[curr.query].variables.representations = [
        ...acc[curr.query].variables.representations,
        ...curr.variables.representations
      ]
    }

    for (let i = 0; i < curr.variables.representations.length; i++) {
      resultIndexes[q.indexOf(curr.query)].push(queryIndex)
    }

    return acc
  }, {})

  return { mergedQueries, resultIndexes }
}

/**
 * Fetches queries result from the service with batching (1 request for all the queries).
 * @param {Object} params
 * @param {Object} params.service The service that will receive one request with the batched queries
 * @returns {Array} result
 */
async function fetchBatchedResult ({ mergeQueriesResult, context, serviceDefinition, service }) {
  const { mergedQueries, resultIndexes } = mergeQueriesResult
  const batchedQueries = []

  for (const [query, { document, variables }] of Object.entries(mergedQueries)) {
    let modifiedQuery

    if (context.preGatewayExecution !== null) {
      ({ modifiedQuery } = await preGatewayExecutionHandler({
        schema: serviceDefinition.schema,
        document,
        context,
        service: { name: service }
      }))
    }

    batchedQueries.push({
      operationName: document.definitions.find(d => d.kind === 'OperationDefinition').name.value,
      query: modifiedQuery || query,
      variables
    })
  }

  const response = await serviceDefinition.sendRequest({
    originalRequestHeaders: context.reply.request.headers,
    body: JSON.stringify(batchedQueries),
    context
  })

  return buildResult({ resultIndexes, data: response.json })
}

/**
 *
 * @param {Object} params
 * @param {Array<Number[]>} params.resultIndexes Array used to map results with queries
 * @param {Array<Object>} params.data Array of data returned from GraphQL end point
 * @returns {Array} result
 */
function buildResult ({ resultIndexes, data }) {
  const result = []

  for (const [queryIndex, queryResponse] of data.entries()) {
    let entityIndex = 0

    for (const entity of queryResponse.data._entities) {
      if (!result[resultIndexes[queryIndex][entityIndex]]) {
        result[resultIndexes[queryIndex][entityIndex]] = {
          ...queryResponse,
          json: {
            data: {
              _entities: [entity]
            }
          }
        }
      } else {
        result[resultIndexes[queryIndex][entityIndex]].json.data._entities.push(entity)
      }

      entityIndex++
    }
  }

  return result
}

/**
 * Fetches queries result from the service without batching (1 request for each query)
 * @param {Object} params
 * @param {GroupedQueries} params.mergeQueriesResult
 * @param {Object} params.service The service that will receive requests for the queries
 * @returns {Array} result
 */
async function fetchResult ({ mergeQueriesResult, serviceDefinition, context, service }) {
  const { mergedQueries, resultIndexes } = mergeQueriesResult
  const queriesEntries = Object.entries(mergedQueries)
  const data = await Promise.all(
    queriesEntries.map(async ([query, { document, variables }]) => {
      let modifiedQuery

      if (context.preGatewayExecution !== null) {
        ({ modifiedQuery } = await preGatewayExecutionHandler({
          schema: serviceDefinition.schema,
          document,
          context,
          service: { name: service }
        }))
      }

      const response = await serviceDefinition.sendRequest({
        originalRequestHeaders: context.reply.request.headers,
        body: JSON.stringify({
          query: modifiedQuery || query,
          variables
        }),
        context
      })

      return response.json
    })
  )

  return buildResult({ data, resultIndexes })
}

/**
 * Fetches queries results from their shared service and returns array of data.
 * It batches queries into one request if allowBatchedQueries is true for the service.
 * @param {Object} params
 * @param {Array} params.queries The list of queries to be executed
 * @param {Object} params.service The service to send requests to
 * @returns {Array} The array of results
 */
async function getQueryResult ({ context, queries, serviceDefinition, service }) {
  const mergeQueriesResult = groupQueriesByDefinition(queries)
  const params = {
    mergeQueriesResult,
    service,
    serviceDefinition,
    queries,
    context
  }

  if (serviceDefinition.allowBatchedQueries) {
    return fetchBatchedResult({ ...params })
  }

  return fetchResult({ ...params })
}

module.exports = getQueryResult
