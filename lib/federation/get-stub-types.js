'use strict'

const {
  Kind,
  isTypeDefinitionNode,
  isTypeExtensionNode
} = require('graphql')

const extensionKindToDefinitionKind = {
  [Kind.SCALAR_TYPE_EXTENSION]: Kind.SCALAR_TYPE_DEFINITION,
  [Kind.OBJECT_TYPE_EXTENSION]: Kind.OBJECT_TYPE_DEFINITION,
  [Kind.INTERFACE_TYPE_EXTENSION]: Kind.INTERFACE_TYPE_DEFINITION,
  [Kind.UNION_TYPE_EXTENSION]: Kind.UNION_TYPE_DEFINITION,
  [Kind.ENUM_TYPE_EXTENSION]: Kind.ENUM_TYPE_DEFINITION,
  [Kind.INPUT_OBJECT_TYPE_EXTENSION]: Kind.INPUT_OBJECT_TYPE_DEFINITION
}

function getStubTypes (schemaDefinitions) {
  const definitionsMap = {}
  const extensionsMap = {}

  for (const definition of schemaDefinitions) {
    const typeName = definition.name.value

    if (isTypeDefinitionNode(definition)) {
      definitionsMap[typeName] = typeName
    } else if (isTypeExtensionNode(definition)) {
      extensionsMap[typeName] = {
        kind: extensionKindToDefinitionKind[definition.kind],
        name: definition.name
      }
    }
  }

  return Object.keys(extensionsMap)
    .filter(extensionTypeName => !definitionsMap[extensionTypeName])
    .map(extensionTypeName => extensionsMap[extensionTypeName])
}

module.exports = getStubTypes
