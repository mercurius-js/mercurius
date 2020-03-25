/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2016-2020 Meteor Development Group, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType,
  Kind,
  extendSchema,
  parse,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  isObjectType
} = require('graphql')

const BASE_FEDERATION_TYPES = `
  scalar _Any
  scalar _FieldSet

  type _Service {
    sdl: String
  }

  directive @external on FIELD_DEFINITION
  directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
  directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
  directive @key(fields: _FieldSet!) on OBJECT | INTERFACE
`

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

          const result = resolveReference(reference, {}, context, info)

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

function addServiceResolver (schema, originalSchemaSDL) {
  schema = extendSchema(schema, parse(`
    extend type Query {
      _service: _Service!
    }
  `), {
    assumeValid: true
  })
  const query = schema.getType('Query')

  const queryFields = query.getFields()
  queryFields._service = {
    ...queryFields._service,
    resolve: () => ({ sdl: originalSchemaSDL })
  }

  return schema
}

function buildFederationSchema (schema) {
  let federationSchema = new GraphQLSchema({
    query: undefined
  })

  federationSchema = extendSchema(federationSchema, parse(BASE_FEDERATION_TYPES))

  const parsedOriginalSchema = parse(schema)
  const stubTypeDefinitions = getStubTypes(parsedOriginalSchema.definitions)

  federationSchema = extendSchema(federationSchema, {
    kind: Kind.DOCUMENT,
    definitions: [
      ...stubTypeDefinitions
    ]
  })

  federationSchema = extendSchema(federationSchema, parsedOriginalSchema)

  if (!federationSchema.getType('Query')) {
    federationSchema = new GraphQLSchema({
      ...federationSchema.toConfig(),
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {}
      })
    })
  }

  federationSchema = addEntitiesResolver(federationSchema)
  federationSchema = addServiceResolver(federationSchema, schema)

  return new GraphQLSchema({
    ...federationSchema.toConfig(),
    query: federationSchema.getType('Query'),
    mutation: federationSchema.getType('Mutation'),
    subscription: federationSchema.getType('Subscription')
  })
}

module.exports = buildFederationSchema
