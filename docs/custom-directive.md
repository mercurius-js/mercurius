# Custom directive
A GraphQL directive is a special syntax used to provide additional information to the GraphQL execution engine about how to process a query, mutation, or schema definition. For example, directives can be used to modify the behaviour of fields, arguments, or types in your schema. 

A custom directive is composed of 2 parts:
- schema definitions
- schema transformer

## Schema Definition
It is the syntax used to describe a custom directive within a GraphQL schema.
To define a custom directive, you must use the directive keyword, followed by its name, arguments (if any), and the locations where it can be applied. 

```
directive @censorship(find: String) on FIELD_DEFINITION
```

## Schema transformer

A schema transformer is a function that takes a GraphQL schema as input and modifies it somehow before returning the modified schema. 

```js
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils')

const censorshipSchemaTransformer = (schema) => mapSchema(schema, {
  // When parsing the schema we find a FIELD
  [MapperKind.FIELD]: fieldConfig => {
    // Get the directive information
    const censorshipDirective = getDirective(schema, fieldConfig, "censorship")?.[0]
    if (censorshipDirective) {
      // Get the resolver of the field
      const innerResolver = fieldConfig.resolve
      // Extract the find property from the directive
      const { find } = censorshipDirective
      // Define a new resolver for the field
      fieldConfig.resolve = async (_obj, args, ctx, info) => {
        // Run the original resolver to get the result
        const document = await innerResolver(_obj, args, ctx, info)
        // Apply censorship only if context censored is true
        if (!ctx.censored) {
          return document
        }
        return { ...document, text: document.text.replace(find, '**********') }
      }
    }
  }
})
```

## Generate executable schema
All the transformations must be applied to the executable schema, which contains both the schema and the resolvers.

```js
const schema = makeExecutableSchema({
  typeDefs: `
    # Define the directive schema
    directive @censorship(find: String) on FIELD_DEFINITION
    
    type Document {
      id: String!
      text: String! 
    }

    type Query {
      document: Document @censorship(find: "password")
    }
    `,
  resolvers
})
```

## Apply transformations to the executable schema

Now we can apply the transformations to the schema before registering the mercurius plugin

```js
app.register(mercurius, {
  // schema changed by the transformer
  schema: censorshipSchemaTransformer(schema),
  context: (request, reply) => {
    return {
      censored: false
    }
  },
  graphiql: true,
})
```