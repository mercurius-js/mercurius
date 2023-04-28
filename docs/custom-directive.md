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

const redactionSchemaTransformer = (schema) =>
  mapSchema(schema, {
    // When parsing the schema we find a FIELD
    [MapperKind.FIELD]: (fieldConfig) => {
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
              return value.replace(PHONE_REGEXP, (m) => "*".repeat(m.length));
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
