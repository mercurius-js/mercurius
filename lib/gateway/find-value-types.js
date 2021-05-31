'use strict'
const {
  isInterfaceType,
  isObjectType,
  isInputType
} = require('graphql')

function getDuplicateTypes (types) {
  const occurrences = {}
  const duplicates = []
  for (const type of types) {
    /* istanbul ignore else */
    if (!occurrences[type.name]) {
      occurrences[type.name] = 1
    } else if (occurrences[type.name] === 1) {
      duplicates.push(type)
      occurrences[type.name] = 2
    }
  }
  return duplicates
}

/**
 * Find all value types according to the definition given here:
 * https://www.apollographql.com/docs/federation/value-types/
 *
 * TODO: it should be checked whether all types with the same name have the exact same fields,
 * incl. types, subtypes and nullability
 * If that is not the case, I would argue that throwing would be the best approach
 */
function findValueTypes (allTypes) {
  // Is exposed by more than one service
  return getDuplicateTypes(allTypes)
    .filter(type => {
      // Has to be object, interface or input
      const isEligibleType = (isObjectType(type) || isInterfaceType(type) || isInputType(type))
      // Is not an entity
      const isNotEntity = !type.astNode.directives.find(directive => directive.name.value === 'key')
      return isEligibleType && isNotEntity
    })
    .map(type => type.name)
}

module.exports = findValueTypes
