'use strict'

const { Kind } = require('graphql')

/**
 * Returns the depth of nodes in a graphql query
 * Based on https://github.com/stems/graphql-depth-limit
 * @param {Array} [definition] the definitions from a graphQL document
 * @returns {Array} {Errors} An array of errors
 */
const queryDepths = (definitions, queryDepthLimit) => {
  const queries = getQueriesAndMutations(definitions)
  const queryDepths = {}
  for (let name in queries) {
    queryDepths[name] = determineDepth(queries[name])
  }
  const errors = []

  if (typeof queryDepthLimit === 'number') {
    for (let query of Object.keys(queryDepths)) {
      const totalDepth = Object.values(queryDepths[query]).reduce((acc, curr) => {
        return acc + curr
      })
      if(totalDepth > queryDepthLimit) {
        const queryDepthError = new Error(`${query} query exceeds the query depth limit of ${queryDepthLimit}`)
        errors.push(queryDepthError)
      }
    }
  }  

  return errors
}

const getQueriesAndMutations = definitions => {
  return definitions.reduce((map, definition) => {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      map[definition.name ? definition.name.value : 'unnamedQuery'] = definition
    }
    return map
  }, {})
}

const determineDepth = (node, totals = {}) => {
  if (node.selectionSet) {
    const name = node.name ? node.name.value : 'unnamedNode'
    if (totals[name]) {
      totals[name] += 1
    } else {
      totals[name] = 1
    }
    node.selectionSet.selections.forEach(selection => {
      determineDepth(selection, totals)
    })
  }
  return totals
}

module.exports = queryDepths
