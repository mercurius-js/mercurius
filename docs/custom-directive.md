# Custom directive

We might need to customise our schema by decorating parts of it or operations to add new reusable features to these elements.
To do that, we can use a GraphQL concept called **Directive**.

A GraphQL directive is a special syntax used to provide additional information to the GraphQL execution engine about how to process a query, mutation, or schema definition.
Directives can be used to modify the behaviour of fields, arguments, or types in your schema.

A custom directive is composed of 2 parts:

- schema definitions
- transformer

## Schema Definition

Let's explore the custom directive creation process by creating a directive to redact some fields value, hiding a phone number or an email.

First of all, we must define the schema

```js
const schema = `
    directive @redact(find: String) on FIELD_DEFINITION
    
    type Document {
      excerpt: String! @redact(find: "email")
      text: String! @redact(find: "phone")
    }

    type Query {
      documents: [Document] 
    }`;
```

To define a custom directive, we must use the directive keyword, followed by its name prefixed by a `@`, the arguments (if any), and the locations where it can be applied.

```
directive @redact(find: String) on FIELD_DEFINITION
```

According to the graphql specs the directive can be applied in multiple locations. See the list on [the GraphQL spec page](https://spec.graphql.org/October2021/#sec-Type-System.Directives).

## Transformer

Every directive needs its transformer.
A transformer is a function that takes an existing schema and applies the modifications to the schema and resolvers.

To simplify the process of creating a transformer, we use the `mapSchema` function from the `@graphql-tools` library.
In this example we are refering to [graphqltools 8.3.20](https://www.npmjs.com/package/graphql-tools/v/8.3.20)

The `mapSchema` function applies each callback function to the corresponding type definition in the schema, creating a new schema with the modified type definitions. The function also provides access to the field resolvers of each object type, allowing you to alter the behaviour of the fields in the schema.

```js
const { mapSchema, getDirective, MapperKind } = require("@graphql-tools/utils");

// Define the regexp
const PHONE_REGEXP = /(?:\+?\d{2}[ -]?\d{3}[ -]?\d{5}|\d{4})/g;
const EMAIL_REGEXP = /([^\s@])+@[^\s@]+\.[^\s@]+/g;

const redactionSchemaTransformer = schema =>
  mapSchema(schema, {
    // When parsing the schema we find a FIELD
    [MapperKind.FIELD]: fieldConfig => {
      // Get the directive information
      const redactDirective = getDirective(schema, fieldConfig, "redact")?.[0];
      if (redactDirective) {
        // Extract the find attribute from the directive, this attribute will
        // be used to chose which replace strategy adopt
        const { find } = redactDirective;
        // Create a new resolver
        fieldConfig.resolve = async (obj, _args, _ctx, info) => {
          // Extract the value of the property we want redact
          // getting the field name from the info parameter.
          const value = obj[info.fieldName];

          // Apply the redaction strategy and return the result
          switch (find) {
            case "email":
              return value.replace(EMAIL_REGEXP, "****@*****.***");
            case "phone":
              return value.replace(PHONE_REGEXP, m => "*".repeat(m.length));
            default:
              return value;
          }
        };
      }
    },
  });
```

As you can see in the new resolver function as props, we receive the `current object`, the `arguments`, the `context` and the `info`.

Using the field name exposed by the `info` object, we get the field value from the `obj` object, object that contains lots of helpful informations like

- fieldNodes
- returnType
- parentType
- operation

## Generate executable schema

To make our custom directive work, we must first create an executable schema required by the `mapSchema` function to change the resolvers' behaviour.

```js
const executableSchema = makeExecutableSchema({
  typeDefs: schema,
  resolvers,
});
```

## Apply transformations to the executable schema

Now it is time to transform our schema.

```js
const newSchema = redactionSchemaTransformer(executableSchema);
```

and to register mercurius inside fastify

```js
app.register(mercurius, {
  schema: newSchema,
  graphiql: true,
});
```

## Example

We have a runnable example on "example/custom-directive.js"

## Federation and Custom Directives

Because schemas involved in GraphQL federation may use special syntax (e.g. `extends`) and custom directives (e.g. `@key`) that are not available in non-federated schemas, there are some extra steps that need to be run to generate the executable schema, involving the use of `buildFederationSchema` from the `@mercuriusjs/federation` library and `printSchemaWithDirectives` from the `@graphql-tools/utils` library.

To see how this works, we will go through another example where we create a custom directive to uppercase the value of a field in a federated environment.

### Schema Definition

The schema definition is equal to the one used in the previous example. We add the `@upper` directive and we decorate the `name` field with it.

```js
const schema = `
  directive @upper on FIELD_DEFINITION

  extend type Query {
    me: User
  }

  type User @key(fields: "id") {
    id: ID! 
    name: String @upper
    username: String
  }`;
```

### Transformer

The transformer follows the same approach used in the previous example. We declare the uppercase transform function and apply it to the field resolver if they have the `@upper` directive.

```js
const { mapSchema, getDirective, MapperKind } = require("@graphql-tools/utils");

const uppercaseTransformer = schema =>
  mapSchema(schema, {
    [MapperKind.FIELD]: fieldConfig => {
      const upperDirective = getDirective(schema, fieldConfig, "upper")?.[0];
      if (upperDirective) {
        fieldConfig.resolve = async (obj, _args, _ctx, info) => {
          const value = obj[info.fieldName];
          return typeof value === "string" ? value.toUpperCase() : value;
        };
      }
    },
  });
```

### Generate executable schema

This section starts to be different. First, we need to create the federation schema using the `buildFederationSchema` function from the `@mercuriusjs/federation` library; then, we can use the `makeExecutableSchema` function from the `@graphql-tools/schema` library to create the executable schema.
Using the `printSchemaWithDirectives`, we can get the schema with all the custom directives applied, and using the `mergeResolvers` function from the `@graphql-tools/merge` library, we can merge the resolvers from the federation schema and the ones we defined.

Following these steps, we can create our executable schema.

```js
const { buildFederationSchema } = require("@mercuriusjs/federation");
const {
  printSchemaWithDirectives,
  getResolversFromSchema,
} = require("@graphql-tools/utils");
const { mergeResolvers } = require("@graphql-tools/merge");
const { makeExecutableSchema } = require("@graphql-tools/schema");

const federationSchema = buildFederationSchema(schema);

const executableSchema = makeExecutableSchema({
  typeDefs: printSchemaWithDirectives(federationSchema),
  resolvers: mergeResolvers([
    getResolversFromSchema(federationSchema),
    resolvers,
  ]),
});
```

### Apply transformations to the executable schema

To apply the transformation, we have to use the mercurius plugin and pass the options:

- **schema**: with the executableSchema already generated
- **schemaTransforms**: with the transformer functions

```js
app.register(mercurius, {
  schema: executableSchema,
  schemaTransforms: [uppercaseTransformer],
  graphiql: true,
});
```

### Example

We have a runnable example in the Federation repo that you can find here [examples/withCustomDirectives.js](https://github.com/mercurius-js/mercurius-federation/tree/main/examples/withCustomDirectives.js).
