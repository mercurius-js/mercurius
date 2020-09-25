'use strict'

const {
  getNamedType,
  print,
  parse,
  Kind
} = require('graphql')

const kEntityResolvers = Symbol('fastify-gql.entity-resolvers')

function getFieldType (schema, type, fieldName) {
  return getNamedType(schema.getType(type).getFields()[fieldName].type)
}

function getDirectiveSelection (node, directiveName) {
  if (!node || !node.astNode) {
    return []
  }

  const directive = node.astNode.directives.find(directive => directive.name.value === directiveName)

  if (!directive) {
    return []
  }

  const query = parse(`{ ${directive.arguments[0].value.value} }`)

  return query.definitions[0].selectionSet.selections
}

function removeNonServiceTypeFields (selections, service, type, schema) {
  const requiredFields = []

  return [
    ...selections.filter(selection => selection.kind === Kind.INLINE_FRAGMENT || selection.kind === Kind.FRAGMENT_SPREAD || service.typeMap[type].has(selection.name.value)).map(selection => {
      if (selection.selectionSet && selection.selectionSet.selections && !(selection.kind === Kind.INLINE_FRAGMENT)) {
        const fieldType = getFieldType(schema, type, selection.name.value)
        requiredFields.push(...getDirectiveSelection(fieldType.getFields && fieldType.getFields()[selection.name.value], 'requires'))

        return {
          ...selection,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: removeNonServiceTypeFields(selection.selectionSet.selections, service, fieldType, schema)
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
    },
    ...getDirectiveSelection(type, 'key'),
    ...requiredFields
  ]
}

function createQueryOperation ({ fieldName, selections, variableDefinitions, args, fragments, operation }) {
  return {
    kind: Kind.DOCUMENT,
    definitions: [{
      kind: Kind.OPERATION_DEFINITION,
      operation,
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

function collectVariableNames (acc, fields) {
  for (const field of fields) {
    if (field.value.kind === Kind.VARIABLE) {
      acc.push(field.value.name.value)
    } else if (field.value.kind === Kind.OBJECT) {
      collectVariableNames(acc, field.value.fields)
    }
  }
}

function collectArgumentNames (fieldNode) {
  const argumentNames = []

  if (fieldNode.arguments) {
    for (const argument of fieldNode.arguments) {
      /* istanbul ignore else if there is no arguments property we return empty array */
      if (argument.value.kind === Kind.VARIABLE) {
        argumentNames.push(argument.value.name.value)
      } else if (argument.value.kind === Kind.OBJECT) {
        collectVariableNames(argumentNames, argument.value.fields)
      } else if (argument.value.kind === Kind.LIST) {
        // TODO: Support GraphQL List
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

function getFragmentNamesInSelection (selections) {
  const fragmentsInSelection = []

  for (const selection of selections) {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      fragmentsInSelection.push(selection.name.value)
    }

    if (selection.selectionSet) {
      fragmentsInSelection.push(...getFragmentNamesInSelection(selection.selectionSet.selections))
    }
  }

  return fragmentsInSelection
}

function collectFragmentsToInclude (usedFragments, fragments, service, schema) {
  const visitedFragments = new Set()
  const result = []

  for (const fragmentName of usedFragments) {
    visitedFragments.add(fragmentName)
    const fragment = fragments[fragmentName]
    const selections = removeNonServiceTypeFields(fragment.selectionSet.selections, service, fragment.typeCondition.name.value, schema)

    result.push({
      ...fragment,
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections
      }
    })

    const fragmentsInSelections = getFragmentNamesInSelection(selections).filter(fragmentName => !visitedFragments.has(fragmentName))
    result.push(...collectFragmentsToInclude(fragmentsInSelections, fragments, service, schema))
  }

  return result
}

function generatePathKey (path) {
  const keys = []
  if (path.prev) {
    keys.push(...generatePathKey(path.prev))
  }

  keys.push(path.key)

  return keys
}

/**
 * Creates a resolver function for a fields type
 *
 * There are 3 options:
 *  - Query field resolver: when the service of the type is null
 *  - Reference entity resolver: when the service of type defined the field on the type
 *  - Field entity resolver: when the field was added through type extension in the service of the field's type
 *
 */
function makeResolver ({ service, createOperation, transformData, isQuery, isReference, isSubscription }) {
  return function (parent, args, context, info) {
    const {
      fieldNodes,
      returnType,
      fieldName,
      parentType,
      operation: originalOperation,
      variableValues,
      fragments,
      schema
    } = info

    if (isReference && !parent[fieldName]) return null

    const resolverKey = generatePathKey(info.path).join('.').replace(/\d/g, '_IDX_')
    const { reply, __currentQuery, lruGatewayResolvers, pubsub } = context

    const cached = lruGatewayResolvers.get(`${__currentQuery}_${resolverKey}`)
    let variableNamesToDefine
    let query

    // Get the actual type as the returnType can be NonNull or List as well
    const type = getNamedType(returnType)

    if (cached) {
      variableNamesToDefine = cached.variableNamesToDefine
      query = cached.query
    } else {
      // Remove items from selections that are not defined in the service
      const selections = fieldNodes[0].selectionSet ? removeNonServiceTypeFields(fieldNodes[0].selectionSet.selections, service, type, schema) : []

      // collect all variable names that are used in selection
      variableNamesToDefine = new Set(collectArgumentsWithVariableValues(selections))
      collectArgumentNames(fieldNodes[0]).map(argumentName => variableNamesToDefine.add(argumentName))
      const variablesToDefine = originalOperation.variableDefinitions.filter(definition => variableNamesToDefine.has(definition.variable.name.value))

      // create the operation that will be sent to the service
      const operation = createOperation({
        returnType: type,
        parentType,
        fieldName,
        selections,
        isQuery,
        isReference,
        variableDefinitions: variablesToDefine,
        args: fieldNodes[0].arguments,
        operation: originalOperation.operation
      })

      query = print(operation)

      // check if fragments are used in the original query
      const usedFragments = getFragmentNamesInSelection(selections)
      const fragmentsToDefine = collectFragmentsToInclude(usedFragments, fragments, service, schema)

      /* istanbul ignore else */
      if (fragmentsToDefine.length > 0) {
        const fragmentsIncluded = new Set()
        for (const fragment of fragmentsToDefine) {
          if (!fragmentsIncluded.has(fragment.name.value)) {
            query += `\n${print(fragment)}`
            fragmentsIncluded.add(fragment.name.value)
          }
        }
      }

      lruGatewayResolvers.set(`${__currentQuery}_${resolverKey}`, { query, variableNamesToDefine })
    }

    const variables = {}

    // Add variables to payload
    for (const [variableName, variableValue] of Object.entries(variableValues)) {
      if (variableNamesToDefine.has(variableName)) {
        variables[variableName] = variableValue
      }
    }

    if (isReference) {
      if (parent[fieldName] instanceof Array) {
        variables.representations = parent[fieldName].map(ref => removeNonIdProperties(ref, type))
      } else {
        variables.representations = [removeNonIdProperties(parent[fieldName], type)]
      }
    } else if (!isQuery && !isSubscription) {
      variables.representations = [{
        ...removeNonIdProperties(parent, parentType),
        ...getRequiredFields(parent, schema.getType(parentType).getFields()[fieldName])
      }]
    }

    if (isSubscription) {
      const subscriptionId = service.createSubscription(query, variables, pubsub.publish.bind(pubsub), context._connectionInit)
      return pubsub.subscribe(`${service.name}_${subscriptionId}`)
    }

    if (isQuery) {
      return service.sendRequest({
        method: 'POST',
        body: JSON.stringify({
          query,
          variables
        }),
        originalRequestHeaders: reply.request.headers
      }).then(transformData)
    }

    return reply[kEntityResolvers][`${service.name}Entity`]({
      query,
      variables,
      originalRequestHeaders: reply.request.headers
    }).then(transformData)
  }
}

function removeNonIdProperties (obj, type) {
  const keyDirective = type.astNode.directives.find(d => d.name.value === 'key')

  const idFields = keyDirective.arguments[0].value.value.split(' ')

  const result = {
    __typename: obj.__typename
  }

  for (const id of idFields) {
    result[id] = obj[id]
  }

  return result
}

function getRequiredFields (obj, field) {
  const requiresDirective = field.astNode.directives.find(d => d.name.value === 'requires')
  const result = {}

  if (!requiresDirective) {
    return result
  }

  const requiredFields = requiresDirective.arguments[0].value.value.split(' ')

  for (const requiredField of requiredFields) {
    result[requiredField] = obj[requiredField]
  }

  return result
}

module.exports = {
  makeResolver,
  createQueryOperation,
  createFieldResolverOperation,
  createEntityReferenceResolverOperation,
  kEntityResolvers
}
