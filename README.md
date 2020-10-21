# mercurius

![CI workflow](https://github.com/fastify/fastify-oauth2/workflows/CI%20workflow/badge.svg)

Mercurius is [**GraphQL**](https://graphql.org/) adapter for [**Fastify**](https://www.fastify.io)

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

## Install

```bash
npm i fastify mercurius
```

The previous name of this module is [fastify-gql](http://npm.im/fastify-gql) (< 6.0.0).

---
- [Install](#install)
- [Example](#example)
  - [makeExecutableSchema support](#makeexecutableschema-support)
- [Context](#context)
- [API](#api)
- [Federation](#federation)
- [Subscriptions](#subscriptions)
- [Batched Queries](#batched-queries)
- [Persisted Queries](#persisted-queries)
- [Plugins](#plugins)
- [Integrations](#integrations)
- [Acknowledgements](#acknowledgements)
- [License](#license)
---

## Example

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

See test.js for more examples, docs are coming.

### makeExecutableSchema support

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const { makeExecutableSchema } = require('@graphql-tools/schema')

const app = Fastify()

const typeDefs = `
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
  schema: makeExecutableSchema({ typeDefs, resolvers })
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)
```

## Context

[More info](docs/context.md)

## API

[More info](docs/api/options.md)

## Federation

[More info](docs/federation.md)

## Subscriptions

[More info](docs/subscriptions.md)

## Batched Queries

[More info](docs/batched-queries.md)

## Persisted Queries

[More info](docs/persisted-queries.md)

## Plugins

[More info](docs/plugins.md)

## Integrations

[More info](docs/integrations/)

## Acknowledgements

The project is kindly sponsored by:

- [NearForm](https://www.nearform.com) for [Matteo](https://github.com/mcollina)'s time in maintaining this module.

The mercurius name was gracefully donated by [Marco Castelluccio](https://github.com/marco-c).
The usage of that library was described in https://hacks.mozilla.org/2015/12/web-push-notifications-from-irssi/, and
you can find that codebase in https://github.com/marco-c/mercurius.

## License

MIT
