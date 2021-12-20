# Plugins

Related plugins for mercurius

- [mercurius-auth](#mercurius-auth)
- [mercurius-cache](#mercurius-cache)
- [mercurius-validation](#mercurius-validation)
- [mercurius-upload](#mercurius-upload)
- [altair-fastify-plugin](#altair-fastify-plugin)
- [mercurius-apollo-registry](#mercurius-apollo-registry)
- [mercurius-apollo-tracing](#mercurius-apollo-tracing)
- [mercurius-postgraphile](#mercurius-postgraphile)

## mercurius-auth

Mercurius Auth is a plugin for [Mercurius](https://mercurius.dev) that adds configurable Authentication and Authorization support.

Check the [`mercurius-auth` documentation](https://github.com/mercurius-js/auth) for detailed usage.

## mercurius-cache

Mercurius Cache is a plugin for [Mercurius](https://mercurius.dev) that caches the results of your GraphQL resolvers, for Mercurius.

Check the [`mercurius-cache` documentation](https://github.com/mercurius-js/cache) for detailed usage.

## mercurius-validation

Mercurius Validation is a plugin for [Mercurius](https://mercurius.dev) that adds configurable validation support.

Check the [`mercurius-validation` documentation](https://github.com/mercurius-js/validation) for detailed usage.

## mercurius-upload

Implementation of [graphql-upload](https://github.com/jaydenseric/graphql-upload) for File upload support.

Check [https://github.com/mercurius-js/mercurius-upload](https://github.com/mercurius-js/mercurius-upload) for detailed usage.

## altair-fastify-plugin

[**Altair**](https://altair.sirmuel.design/) plugin. Fully featured GraphQL Client IDE, good alternative of `graphiql`.

```bash
npm install altair-fastify-plugin
```

```js
const AltairFastify = require('altair-fastify-plugin')
// ...
const app = Fastify()

app.register(mercurius, {
  // ...
  graphiql: false,
  ide: false,
  path: '/graphql'
})
// ...
app.register(AltairFastify, {
  path: '/altair',
  baseURL: '/altair/',
  // 'endpointURL' should be the same as the mercurius 'path'
  endpointURL: '/graphql'
})

app.listen(3000)
```

And it will be available at `http://localhost:3000/altair` 🎉

Check [here](https://github.com/imolorhe/altair/tree/staging/packages/altair-fastify-plugin) for more information.

## mercurius-apollo-registry

A Mercurius plugin for schema reporting to Apollo Studio.

Check [https://github.com/nearform/mercurius-apollo-registry](https://github.com/nearform/mercurius-apollo-registry) for usage and readme.

```bash
npm install mercurius-apollo-registry
```

```js
const app = Fastify()
const mercurius = require('mercurius')
const mercuriusApolloRegistry = require('mercurius-apollo-registry')

const schema = `define schema here`
const resolvers = { 
  // ... 
}

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: true
})

app.register(mercuriusApolloRegistry, {
  schema,
  apiKey: 'REPLACE-THIS-VALUE-WITH-APOLLO-API-KEY'
})

app.listen(3000)
```

## mercurius-apollo-tracing

A Mercurius plugin for reporting performance metrics and errors to Apollo Studio.

```bash
npm install mercurius-apollo-tracing
```

```js
const mercuriusTracing = require('mercurius-apollo-tracing')

app.register(mercuriusTracing, {
  apiKey: 'REPLACE-THIS-VALUE-WITH-APOLLO-API-KEY', // replace with the one from apollo studio
  graphRef: 'yourGraph@ref' // replace 'yourGraph@ref'' with the one from apollo studio
})
```

## mercurius-postgraphile
A Mercurius plugin for integrating PostGraphile schemas with Mercurius

Check [https://github.com/autotelic/mercurius-postgraphile](https://github.com/autotelic/mercurius-postgraphile) for usage and readme.
