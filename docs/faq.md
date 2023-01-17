# FAQ

This page answers commonly asked questions about Mercurius.

## Disable Graphql introspection
To disable Graphql introspection you can use `NoSchemaIntrospectionCustomRule` from graphql. We have an example on "example/disable-instrospection.js", using this approach:

```js
import { NoSchemaIntrospectionCustomRule } from 'graphql';

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`
const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

app.register(mercurius, {
  context: buildContext,
  schema,
  resolvers,
  validationRules: process.env.NODE_ENV === 'production' && [NoSchemaIntrospectionCustomRule],
});
```
