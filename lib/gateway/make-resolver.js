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

function createQueryOperation ({ fieldName, selections }) {
  return {
    kind: Kind.DOCUMENT,
    definitions: [{
      kind: Kind.OPERATION_DEFINITION,
      operation: 'query',
      name: {
        kind: Kind.NAME,
        value: `Query_${fieldName}`
      },
      directives: [],
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [{
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: fieldName
          },
          arguments: [],
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

function createEntityReferenceResolverOperation ({ returnType, selections }) {
  return {
    kind: Kind.DOCUMENT,
    definitions: [{
      kind: Kind.OPERATION_DEFINITION,
      operation: 'query',
      name: {
        kind: Kind.NAME,
        value: 'EntitiesQuery'
      },
      variableDefinitions: [{
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
      }],
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

function createFieldResolverOperation ({ parentType, fieldName, selections }) {
  return createEntityReferenceResolverOperation({
    returnType: parentType,
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

function makeResolver ({ service, createOperation, transformData, isQuery, isReference }) {
  return function (parent, args, context, info) {
    const { fieldNodes, returnType, fieldName, parentType } = info
    const type = getNamedType(returnType)

    const selections = removeNonServiceTypeFields(fieldNodes[0].selectionSet.selections, service, type)
    const operation = createOperation({
      returnType: type,
      parentType,
      fieldName,
      selections,
      isQuery,
      isReference
    })

    const query = print(operation)

    let variables = {}

    if (isQuery) {
      variables = {}
    } else if (isReference) {
      variables.representations = [parent[fieldName]]
    } else {
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
