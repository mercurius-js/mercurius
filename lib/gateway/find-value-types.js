const {
  isInterfaceType,
  isObjectType,
  isInputType
} = require('graphql')

function duplicates (array) {
  const uniq = array
    .map((item) => {
      return {
        count: 1,
        item
      }
    })
    .reduce((a, b) => {
      a[b.item] = (a[b.item] || 0) + b.count
      return a
    }, {})
  return Object.keys(uniq).filter((a) => uniq[a] > 1)
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
  // Iterate all service defs and find all types by name that are used by more than one service
  const duplicateNames = duplicates(allTypes.map(type => type.name))
  const valueTypes = []
  new Set(
    allTypes
      .filter(type => {
        // Has to be object, interface or input
        const isEligibleType = (isObjectType(type) || isInterfaceType(type) || isInputType(type))
        // Is exposed by more than one service
        const isDuplicate = duplicateNames.includes(type.name)
        // Is not an entity
        const isNotEntity = !type.astNode.directives.find(directive => directive.name.value === 'key')
        return isEligibleType && isDuplicate && isNotEntity
      })
      .map(type => type.name)
  ).forEach(type => {
    valueTypes.push(type)
  })
  return valueTypes
}

module.exports = {
  findValueTypes
}
