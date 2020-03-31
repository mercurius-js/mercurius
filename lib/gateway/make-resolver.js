'use strict'

const {
  getNamedType,
  print,
  Kind
} = require('graphql')

function removeNonServiceTypeFields (selections, service, type) {
  return [
    ...selections.filter(selection => service.typeMap[type].has(selection.name.value)).map(selection => {
      if (selection.selectionSet && selection.selectionSet.selections) {
        return {
          ...selection,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: removeNonServiceTypeFields(selection.selectionSet.selections, service, type)
          }
        }
      }

      return selection
    }),
    {
      kind: Kind.FIELD,
      name: {
        kind: Kind.NAME,
        value: '__typename'
      },
      arguments: [],
      directives: []
    }
  ]
}

function createQueryOperation ({ fieldName, selections, variableDefinitions, args }) {
  return {
    kind: Kind.DOCUMENT,
    definitions: [{
      kind: Kind.OPERATION_DEFINITION,
      operation: 'query',
      name: {
        kind: Kind.NAME,
        value: `Query_${fieldName}`
      },
      variableDefinitions,
      directives: [],
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [{
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: fieldName
          },
          arguments: args,
          directives: [],
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections
          }
        }]
      }
    }]
  }
}

function createEntityReferenceResolverOperation ({ returnType, selections, variableDefinitions }) {
  return {
    kind: Kind.DOCUMENT,
    definitions: [{
      kind: Kind.OPERATION_DEFINITION,
      operation: 'query',
      name: {
        kind: Kind.NAME,
        value: 'EntitiesQuery'
      },
      variableDefinitions: [
        ...variableDefinitions,
        {
          kind: Kind.VARIABLE_DEFINITION,
          variable: {
            kind: Kind.VARIABLE,
            name: {
              kind: Kind.NAME,
              value: 'representations'
            }
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.LIST_TYPE,
              type: {
                kind: Kind.NON_NULL_TYPE,
                type: {
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: '_Any'
                  }
                }
              }
            }
          },
          directives: []
        }
      ],
      directives: [],
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [{
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: '_entities'
          },
          arguments: [
            {
              kind: Kind.ARGUMENT,
              name: {
                kind: Kind.NAME,
                value: 'representations'
              },
              value: {
                kind: Kind.VARIABLE,
                name: {
                  kind: Kind.NAME,
                  value: 'representations'
                }
              }
            }
          ],
          directives: [],
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: {
                  kind: Kind.NAME,
                  value: '__typename'
                },
                arguments: [],
                directives: []
              },
              {
                kind: Kind.INLINE_FRAGMENT,
                typeCondition: {
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: returnType
                  }
                },
                directives: [],
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections
                }
              }
            ]
          }
        }]
      }
    }]
  }
}

function createFieldResolverOperation ({ parentType, fieldName, selections, variableDefinitions }) {
  return createEntityReferenceResolverOperation({
    returnType: parentType,
    variableDefinitions,
    selections: [{
      kind: Kind.FIELD,
      name: {
        kind: Kind.NAME,
        value: fieldName
      },
      directives: [],
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections
      }
    }]
  })
}

function collectArgumentNames (fieldNode) {
  const argumentNames = []

  /* istanbul ignore else if there is no arguments property we return empty array */
  if (fieldNode.arguments) {
    for (const argument of fieldNode.arguments) {
      if (argument.value.kind === Kind.VARIABLE) {
        argumentNames.push(argument.name.value)
      }
    }
  }

  return argumentNames
}

function collectArgumentsWithVariableValues (selections) {
  const argumentNames = []

  for (const selection of selections) {
    argumentNames.push(...collectArgumentNames(selection))

    if (selection.selectionSet && selection.selectionSet.selections) {
      argumentNames.push(...collectArgumentsWithVariableValues(selection.selectionSet.selections))
    }
  }

  return argumentNames
}

function makeResolver ({ service, createOperation, transformData, isQuery, isReference }) {
  return function (parent, args, context, info) {
    const { fieldNodes, returnType, fieldName, parentType, operation: originalOperation, variableValues } = info

    const type = getNamedType(returnType)
    const selections = removeNonServiceTypeFields(fieldNodes[0].selectionSet.selections, service, type)

    const variableNamesToDefine = new Set(collectArgumentsWithVariableValues(selections))
    collectArgumentNames(fieldNodes[0]).map(argumentName => variableNamesToDefine.add(argumentName))
    const variablesToDefine = originalOperation.variableDefinitions.filter(definition => variableNamesToDefine.has(definition.variable.name.value))

    const operation = createOperation({
      returnType: type,
      parentType,
      fieldName,
      selections,
      isQuery,
      isReference,
      variableDefinitions: variablesToDefine,
      args: fieldNodes[0].arguments
    })

    const query = print(operation)

    const variables = {}

    for (const [variableName, variableValue] of Object.entries(variableValues)) {
      if (variableNamesToDefine.has(variableName)) {
        variables[variableName] = variableValue
      }
    }

    if (isReference) {
      variables.representations = [parent[fieldName]]
    } else if (!isQuery) {
      variables.representations = [parent]
    }

    return service.request({
      method: 'POST',
      body: JSON.stringify({
        query,
        variables
      })
    }).then(transformData)
  }
}

module.exports = {
  makeResolver,
  createQueryOperation,
  createFieldResolverOperation,
  createEntityReferenceResolverOperation
}
