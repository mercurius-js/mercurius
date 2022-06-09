# FAQ

This page answers commonly asked questions about Mercurius.

## Disable Graphql introspection
To disable Graphql introspection you can use `NoSchemaIntrospectionCustomRule` from graphql. We have an example on "example/disable-instrospection.js", using this approach:

```js
import { NoSchemaIntrospectionCustomRule } from 'graphql';

app.register(mercurius, {
  context: buildContext,
  gateway: {
    services: [....],
    pollingInterval: 30000,
  },
  validationRules: process.env.NODE_ENV === 'production' && [NoSchemaIntrospectionCustomRule],
});
```
