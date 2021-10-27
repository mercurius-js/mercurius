# FAQ

This page answers common asked questions about Mercurius.

## Disable Graphql instrospection
To disable Graphql instrospection you can use `NoSchemaIntrospectionCustomRule` from graphql, we have an example on "example/disable-instrospection.js", using this approach:

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