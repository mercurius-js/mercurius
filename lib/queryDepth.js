'use strict'

const { Kind } = require('graphql')
const { MER_ERR_GQL_QUERY_DEPTH } = require('./errors')

/**
 * Returns the depth of nodes in a graphql query
 * Based on the GraphQL Depth Limit package from Stem (https://stem.is)
 * Project: graphql-depth-limit https://github.com/stems/graphql-depth-limit
 * Copyright (c) 2017 Stem
 * License (MIT License) https://github.com/stems/graphql-depth-limit/blob/master/LICENSE
 * @param {Array} [definition] the definitions from a graphQL document
 * @returns {Array} {Errors} An array of errors
 */
function queryDepth (definitions, queryDepthLimit) {
  const { operations, fragments } = getOperationsAndFragments(definitions)
  const fragmentDepths = new Map()
  const errors = []

  for (const [name, operation] of operations) {
    const totalDepth = determineDepth(operation, fragments, fragmentDepths)
    if (typeof queryDepthLimit === 'number' && totalDepth > queryDepthLimit) {
      const queryDepthError = new MER_ERR_GQL_QUERY_DEPTH(name, totalDepth, queryDepthLimit)
      errors.push(queryDepthError)
    }
  }

  return errors
}

function determineDepth (node, fragments, fragmentDepths) {
  const visitingFragments = new Set()
  const actions = [{ type: 'node', node, current: 0 }]
  const depths = []

  while (actions.length > 0) {
    const action = actions.pop()

    if (action.type === 'selections') {
      let depth = action.current
      for (let i = 0; i < action.count; i++) {
        depth = Math.max(depth, depths.pop())
      }
      depths.push(depth)
      continue
    }

    if (action.type === 'fragment') {
      const fragmentDepth = depths.pop()
      visitingFragments.delete(action.name)
      fragmentDepths.set(action.name, fragmentDepth)
      depths.push(action.current + fragmentDepth)
      continue
    }

    const currentNode = action.node
    const current = action.current

    if (currentNode.kind === Kind.FRAGMENT_SPREAD) {
      const name = currentNode.name.value
      if (fragmentDepths.has(name)) {
        depths.push(current + fragmentDepths.get(name))
        continue
      }

      const fragment = fragments.get(name)
      if (!fragment) {
        depths.push(current)
        continue
      }

      // Cyclic fragments are invalid, but the subscription path can call this
      // function before validation. Reject them without looping indefinitely.
      if (visitingFragments.has(name)) {
        depths.push(Infinity)
        continue
      }

      visitingFragments.add(name)
      actions.push({ type: 'fragment', name, current })
      actions.push({ type: 'node', node: fragment, current: 0 })
      continue
    }

    const selections = currentNode.selectionSet && currentNode.selectionSet.selections
    if (!selections || selections.length === 0) {
      depths.push(current)
      continue
    }

    actions.push({ type: 'selections', count: selections.length, current })
    for (let i = selections.length - 1; i >= 0; i--) {
      const selection = selections[i]
      // A fragment spread substitutes its fragment's selections and therefore
      // does not add a depth level of its own.
      const nextDepth = selection.kind === Kind.FRAGMENT_SPREAD ? current : current + 1
      actions.push({ type: 'node', node: selection, current: nextDepth })
    }
  }

  return depths[0]
}

function getOperationsAndFragments (definitions) {
  const operations = []
  const fragments = new Map()

  for (const definition of definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      operations.push([definition.name ? definition.name.value : 'unnamedQuery', definition])
    } else if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition)
    }
  }

  return { operations, fragments }
}

module.exports = queryDepth
