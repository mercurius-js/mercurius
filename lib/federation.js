const { 
  buildSchema,
  extendSchema,
  validateSchema,
  parse,
  print,
  isObjectType,
  isInputObjectType
} = require('graphql')

const federationSchema = `
scalar _Any
scalar _FieldSet

# a union of all types that use the @key directive

type _Service {
  sdl: String
}

type Query {
  _service: _Service!
}

directive @external on FIELD_DEFINITION
directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
directive @key(fields: _FieldSet!) on OBJECT | INTERFACE

# this is an optional directive discussed below
directive @extends on OBJECT | INTERFACE
`

function hasDirectives(
  node,
) {
  return Boolean('directives' in node && node.directives);
}

function gatherDirectives(
  type
) {
  let directives = [];
  if ('extensionASTNodes' in type && type.extensionASTNodes) {
    for (const node of type.extensionASTNodes) {
      if (hasDirectives(node)) {
        directives = directives.concat(node.directives);
      }
    }
  }

  if (type.astNode && hasDirectives(type.astNode))
    directives = directives.concat(type.astNode.directives);

  return directives;
}

function typeIncludesDirective(
  type,
  directiveName,
) {
  if (isInputObjectType(type)) return false;
  const directives = gatherDirectives(type);
  return directives.some(directive => directive.name.value === directiveName);
}

module.exports.buildFederationSchema = (originalSchema) => {
  let schema = buildSchema(federationSchema)

  schema = extendSchema(schema, parse(originalSchema))

  const entityTypes = Object.values(schema.getTypeMap()).filter(
    type => isObjectType(type) && typeIncludesDirective(type, 'key'),
  );
  
  if (entityTypes.length > 0) {
    schema = extendSchema(schema, parse(`
      union _Entity = ${entityTypes.join(' | ')}

      extend type Query {
        _entities(representations: [_Any!]!): [_Entity]!
      }
    `))
  }

  const query = schema.getType('Query')

  const queryFields = query.getFields()
  queryFields._service = {
    ...queryFields._service,
    resolve: () => ({ sdl: originalSchema })
  }
  
  return schema
}