# mercurius

![CI workflow](https://github.com/mercurius-js/mercurius/workflows/CI%20workflow/badge.svg)

Mercurius is a [**GraphQL**](https://graphql.org/) adapter for [**Fastify**](https://www.fastify.io)

Features:

- Caching of query parsing and validation.
- Automatic loader integration to avoid 1 + N queries.
- Just-In-Time compiler via [graphql-jit](http://npm.im/graphql-jit).
- Subscriptions.
- Federation support.
- Federated subscriptions support.
- Gateway implementation, including Subscriptions.
- Batched query support.
- Customisable persisted queries.

## Docs

- [Install](#install)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [API](docs/api/options.md)
- [Context](docs/context.md)
- [Loaders](docs/loaders.md)
- [Hooks](docs/hooks.md)
- [Lifecycle](docs/lifecycle.md)
- [Federation](docs/federation.md)
- [Subscriptions](docs/subscriptions.md)
- [Batched Queries](docs/batched-queries.md)
- [Persisted Queries](docs/persisted-queries.md)
- [TypeScript Usage](/docs/typescript.md)
- [Integrations](docs/integrations/)
- [Related Plugins](docs/plugins.md)
- [Protocol Extensions](/docs/protocol-extension.md)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Install

```bash
npm i fastify mercurius graphql
# or
yarn add fastify mercurius graphql
```

The previous name of this module was [fastify-gql](http://npm.im/fastify-gql) (< 6.0.0).

## Quick Start

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')

const app = Fastify()

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)
```

## Examples

Check [GitHub repo](https://github.com/mercurius-js/mercurius/tree/master/examples) for more examples.

## Acknowledgements

The project is kindly sponsored by:

- [NearForm](https://www.nearform.com) for [Matteo](https://github.com/mcollina)'s time in maintaining this module.

The Mercurius name was gracefully donated by [Marco Castelluccio](https://github.com/marco-c).
The usage of that library was described in https://hacks.mozilla.org/2015/12/web-push-notifications-from-irssi/, and
you can find that codebase in https://github.com/marco-c/mercurius.

## License

MIT
