'use strict'

const {
  getNamedType,
  print,
  Kind
} = require('graphql')

function sendServiceRequest (service, query, variables = {}) {
  return service.request({
    method: 'POST',
    body: JSON.stringify({
      query,
      variables
    })
  })
}

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

function createQueryOperation (fieldName, selections) {
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

function createEntityReferenceResolverOperation (inlineFragmentOnType, selections) {
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
                    value: inlineFragmentOnType
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

function createFieldResolverOperation (fragmentType, fieldName, selections) {
  return createEntityReferenceResolverOperation(fragmentType, [{
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
  }])
}

function makeQueryResolver (service) {
  return function (root, args, context, info) {
    const { fieldName, returnType, fieldNodes } = info
    const type = getNamedType(returnType)

    let selections = JSON.parse(JSON.stringify(fieldNodes[0].selectionSet.selections))
    selections = removeNonServiceTypeFields(selections, service, type.name)

    const operation = createQueryOperation(fieldName, selections)

    return sendServiceRequest(service, print(operation)).then(response => response.json.data[fieldName])
  }
}

function makeFieldResolver (service, typeForFragment) {
  return function (parent, args, context, info) {
    const { fieldNodes, returnType, fieldName } = info
    const type = getNamedType(returnType)

    let selections = JSON.parse(JSON.stringify(fieldNodes[0].selectionSet.selections))
    selections = removeNonServiceTypeFields(selections, service, type)

    const operation = createFieldResolverOperation(typeForFragment, fieldName, selections)

    return sendServiceRequest(
      service,
      print(operation),
      { representations: [parent] })
      .then(response => response.json.data._entities[0][fieldName])
  }
}

function makeReferenceResolver (service) {
  return function (parent, args, context, info) {
    const { fieldNodes, returnType, fieldName } = info
    const type = getNamedType(returnType)

    let selections = JSON.parse(JSON.stringify(fieldNodes[0].selectionSet.selections))
    selections = removeNonServiceTypeFields(selections, service, type)

    const operation = createEntityReferenceResolverOperation(type, selections)

    return sendServiceRequest(
      service,
      print(operation),
      { representations: [parent[fieldName]] })
      .then(response => response.json.data._entities[0])
  }
}

module.exports = {
  makeFieldResolver,
  makeReferenceResolver,
  makeQueryResolver
}
