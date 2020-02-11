'use strict'

const { Kind } = require('graphql')

/**
 * Returns the depth of nodes in a graphql query
 * Based on the the GraphQL Depth Limit package from Stem (https://stem.is)
 * Project: graphql-depth-limit https://github.com/stems/graphql-depth-limit
 * Copyright (c) 2017 Stem
 * License (MIT License) https://github.com/stems/graphql-depth-limit/blob/master/LICENSE
 * @param {Array} [definition] the definitions from a graphQL document
 * @returns {Array} {Errors} An array of errors
 */
function queryDepth (definitions, queryDepthLimit) {
  const queries = getQueriesAndMutations(definitions)
  const queryDepth = {}

  for (const name in queries) {
    queryDepth[name] = determineDepth(queries[name])
  }

  const errors = []
  if (typeof queryDepthLimit === 'number') {
    for (const query of Object.keys(queryDepth)) {
      const totalDepth = queryDepth[query]
      if (totalDepth > queryDepthLimit) {
        const queryDepthError = new Error(`${query} query exceeds the query depth limit of ${queryDepthLimit}`)
        errors.push(queryDepthError)
      }
    }
  }

  return errors
}
function determineDepth (node, current = 0) {
  let result = current
  if (node.selectionSet) {
    for (const selection of node.selectionSet.selections) {
      result = determineDepth(selection, current++)
    }
  }
  return result
}
function getQueriesAndMutations (definitions) {
  return definitions.reduce((map, definition) => {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      map[definition.name ? definition.name.value : 'unnamedQuery'] = definition
    }
    return map
  }, {})
}

module.exports = queryDepth
