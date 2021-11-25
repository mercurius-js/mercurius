'use strict'

const {
  parse
} = require('graphql')
const { preGatewayExecutionHandler } = require('../handlers')

const mergeQueries = (queries) => {
  const q = [...new Set(queries.map(q => q.query))]
  const resultIndexes = []
  const mergedQueries = queries.reduce((acc, curr, queryIndex) => {
    if (!acc[curr.query]) {
      acc[curr.query] = curr.variables
      resultIndexes[q.indexOf(curr.query)] = []
    } else {
      acc[curr.query].representations = [
        ...acc[curr.query].representations,
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

const getBactchedResult = async ({ mergeQueriesResult, queries, serviceDefinition, service }) => {
  const { mergedQueries, resultIndexes } = mergeQueriesResult
  const context = queries[0].context
  const originalRequestHeaders = queries[0].originalRequestHeaders
  const batchedQueries = []

  for (const [query, variables] of Object.entries(mergedQueries)) {
    const document = parse(query)
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
      query: query || modifiedQuery,
      variables
    })
  }

  const response = await serviceDefinition.sendRequest({
    originalRequestHeaders,
    body: JSON.stringify(batchedQueries),
    context
  })

  return buildResult({ resultIndexes, data: response.json })
}

const buildResult = ({ resultIndexes, data }) => {
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

const getResult = async ({ mergeQueriesResult, serviceDefinition, queries, service }) => {
  const { mergedQueries, resultIndexes } = mergeQueriesResult
  const jsons = []
  const queriesEntries = Object.entries(mergedQueries)

  for await (const [queryIndex, [query, variables]] of queriesEntries.entries()) {
    let modifiedQuery

    if (queries[queryIndex].context.preGatewayExecution !== null) {
      ({ modifiedQuery } = await preGatewayExecutionHandler({
        schema: serviceDefinition.schema,
        document: parse(query),
        context: queries[queryIndex].context,
        service: { name: service }
      }))
    }

    const response = await serviceDefinition.sendRequest({
      originalRequestHeaders: queries[queryIndex].originalRequestHeaders,
      body: JSON.stringify({
        query: modifiedQuery || query,
        variables
      }),
      context: queries[queryIndex].context
    })

    jsons.push(response.json)
  }

  return buildResult({ data: jsons, resultIndexes })
}

const getQueryResult = async ({ queries, serviceDefinition, service }) => {
  const mergeQueriesResult = mergeQueries(queries)
  const params = {
    mergeQueriesResult,
    service,
    serviceDefinition,
    queries
  }

  if (serviceDefinition.allowBatchedQueries) {
    return getBactchedResult({ ...params })
  }

  return getResult({ ...params })
}

module.exports = getQueryResult
