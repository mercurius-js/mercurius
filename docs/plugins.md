# Plugins

Related plugins for mercurius

## mercurius-upload

Implementation of [graphql-upload](https://github.com/jaydenseric/graphql-upload) for File upload support.

Check [https://github.com/mercurius-js/mercurius-upload](https://github.com/mercurius-js/mercurius-upload) for detailed usage.

## altair-fastify-plugin

[**Altair**](https://altair.sirmuel.design/) plugin. Fully featured GraphQL Client IDE, good alternative of `graphiql` and `graphql-playground`.

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
