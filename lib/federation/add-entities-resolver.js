'use strict'

const {
  isObjectType,
  extendSchema,
  parse
} = require('graphql')

function gatherDirectives (type) {
  let directives = []
  for (const node of (type.extensionASTNodes || [])) {
    /* istanbul ignore else we are not interested in nodes that does not have directives */
    if (node.directives) {
      directives = directives.concat(node.directives)
    }
  }

  if (type.astNode && type.astNode.directives) {
    directives = directives.concat(type.astNode.directives)
  }

  return directives
}

function typeIncludesDirective (type, directiveName) {
  const directives = gatherDirectives(type)
  return directives.some(directive => directive.name.value === directiveName)
}

function addTypeNameToResult (result, typename) {
  /* istanbul ignore else when result is null or not an object we return original result */
  if (result !== null && typeof result === 'object') {
    Object.defineProperty(result, '__typename', {
      value: typename
    })
  }
  return result
}

function addEntitiesResolver (schema) {
  const entityTypes = Object.values(schema.getTypeMap()).filter(
    type => isObjectType(type) && typeIncludesDirective(type, 'key')
  )

  if (entityTypes.length > 0) {
    schema = extendSchema(schema, parse(`
      union _Entity = ${entityTypes.join(' | ')}

      extend type Query {
        _entities(representations: [_Any!]!): [_Entity]!
      }
    `), {
      assumeValid: true
    })

    const query = schema.getType('Query')
    const queryFields = query.getFields()
    queryFields._entities = {
      ...queryFields._entities,
      resolve: (_source, { representations }, context, info) => {
        return representations.map((reference) => {
          const { __typename } = reference

          const type = info.schema.getType(__typename)
          if (!type || !isObjectType(type)) {
            throw new Error(
              `The _entities resolver tried to load an entity for type "${__typename}", but no object type of that name was found in the schema`
            )
          }

          const resolveReference = type.resolveReference
            ? type.resolveReference
            : function defaultResolveReference () {
              return reference
            }

          const result = resolveReference(reference, context, info)

          if (result && 'then' in result && typeof result.then === 'function') {
            return result.then(x =>
              addTypeNameToResult(x, __typename)
            )
          }

          return addTypeNameToResult(result, __typename)
        })
      }
    }
  }

  return schema
}

module.exports = addEntitiesResolver
