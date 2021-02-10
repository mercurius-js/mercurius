'use strict'

const { Kind } = require('graphql')
const { MER_ERR_GQL_QUERY_DEPTH } = require('./errors')

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
        const queryDepthError = new MER_ERR_GQL_QUERY_DEPTH(query, totalDepth, queryDepthLimit)
        errors.push(queryDepthError)
      }
    }
  }

  return errors
}
function determineDepth (node, current = 0) {
  if (node.selectionSet) {
    return Math.max(...node.selectionSet.selections.map((selection) => determineDepth(selection, current + 1)))
  }
  return current
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
