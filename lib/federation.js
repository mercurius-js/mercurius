'use strict'

const {
  buildSchema,
  extendSchema,
  parse,
  isObjectType,
  Kind,
  isTypeDefinitionNode,
  isTypeExtensionNode
} = require('graphql')

const federationSchema = `
scalar _Any
scalar _FieldSet

# a union of all types that use the @key directive
# union _Entity

type _Service {
  sdl: String
}

type Query {
  #_entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}

directive @external on FIELD_DEFINITION
directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
directive @key(fields: _FieldSet!) on OBJECT | INTERFACE

# this is an optional directive discussed below
# directive @extends on OBJECT | INTERFACE
`

function hasDirectives (node) {
  return Boolean('directives' in node && node.directives)
}

function gatherDirectives (type) {
  let directives = []
  if ('extensionASTNodes' in type && type.extensionASTNodes) {
    for (const node of type.extensionASTNodes) {
      /* istanbul ignore else */
      if (hasDirectives(node)) {
        directives = directives.concat(node.directives)
      }
    }
  }

  if (type.astNode && hasDirectives(type.astNode)) {
    directives = directives.concat(type.astNode.directives)
  }

  return directives
}

function addTypeNameToResult (result, typename) {
  /* istanbul ignore else */
  if (result !== null && typeof result === 'object') {
    Object.defineProperty(result, '__typename', {
      value: typename
    })
  }
  return result
}

function typeIncludesDirective (type, directiveName) {
  const directives = gatherDirectives(type)
  return directives.some(directive => directive.name.value === directiveName)
}

module.exports.buildFederationSchema = (originalSchema) => {
  let schema = buildSchema(federationSchema)

  const parsedOriginalSchema = parse(originalSchema)

  const missingTypeDefinitions = []
  const definitionsMap = {}
  const extensionsMap = {}
  const directiveDefinitions = []

  for (const definition of parsedOriginalSchema.definitions) {
    /* istanbul ignore else */
    if (isTypeDefinitionNode(definition) || definition.name.value === 'Query') {
      const typeName = definition.name.value

      /* istanbul ignore else */
      if (!definitionsMap[typeName]) {
        definitionsMap[typeName] = []
      }
      definitionsMap[typeName].push(definition)
    } else if (isTypeExtensionNode(definition)) {
      const typeName = definition.name.value

      /* istanbul ignore else */
      if (!extensionsMap[typeName]) {
        extensionsMap[typeName] = []
      }
      extensionsMap[typeName].push(definition)
    } else if (definition.kind === Kind.DIRECTIVE_DEFINITION) {
      directiveDefinitions.push(definition)
    }
  }

  for (const [extendedTypeName, extensions] of Object.entries(extensionsMap)) {
    /* istanbul ignore else */
    if (!definitionsMap[extendedTypeName]) {
      const extension = extensions[0]

      const kind = extension.kind
      const definition = {
        kind: extKindToDefKind[kind],
        name: extension.name
      }

      missingTypeDefinitions.push(definition)
    }
  }

  schema = extendSchema(schema, {
    kind: Kind.DOCUMENT,
    definitions: [
      ...Object.values(definitionsMap).flat(),
      ...missingTypeDefinitions,
      ...directiveDefinitions
    ]
  })

  schema = extendSchema(
    schema,
    {
      kind: Kind.DOCUMENT,
      definitions: Object.values(extensionsMap).flat()
    },
    {
      assumeValidSDL: true
    }
  )

  const entityTypes = Object.values(schema.getTypeMap()).filter(
    type => isObjectType(type) && typeIncludesDirective(type, 'key')
  )

  /* istanbul ignore else */
  if (entityTypes.length > 0) {
    schema = extendSchema(schema, parse(`
      union _Entity = ${entityTypes.join(' | ')}

      extend type Query {
        _entities(representations: [_Any!]!): [_Entity]!
      }
    `))

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

  const query = schema.getType('Query')

  const queryFields = query.getFields()
  queryFields._service = {
    ...queryFields._service,
    resolve: () => ({ sdl: originalSchema })
  }

  return schema
}

const extKindToDefKind = {
  [Kind.SCALAR_TYPE_EXTENSION]: Kind.SCALAR_TYPE_DEFINITION,
  [Kind.OBJECT_TYPE_EXTENSION]: Kind.OBJECT_TYPE_DEFINITION,
  [Kind.INTERFACE_TYPE_EXTENSION]: Kind.INTERFACE_TYPE_DEFINITION,
  [Kind.UNION_TYPE_EXTENSION]: Kind.UNION_TYPE_DEFINITION,
  [Kind.ENUM_TYPE_EXTENSION]: Kind.ENUM_TYPE_DEFINITION,
  [Kind.INPUT_OBJECT_TYPE_EXTENSION]: Kind.INPUT_OBJECT_TYPE_DEFINITION
}
