# mercurius

- [mercurius](#mercurius)
  - [API](#api)
    - [plugin options](#plugin-options)
      - [queryDepth example](#querydepth-example)
    - [HTTP endpoints](#http-endpoints)
      - [GET /graphql](#get-graphql)
      - [POST /graphql](#post-graphql)
      - [POST /graphql with Content-type: application/graphql](#post-graphql-with-content-type-applicationgraphql)
      - [GET /graphiql](#get-graphiql)
      - [GET /playground](#get-playground)
    - [decorators](#decorators)
      - [app.graphql(source, context, variables, operationName)](#appgraphqlsource-context-variables-operationname)
      - [app.graphql.extendSchema(schema) and app.graphql.defineResolvers(resolvers)](#appgraphqlextendschemaschema-and-appgraphqldefineresolversresolvers)
      - [app.graphql.replaceSchema(schema)](#appgraphqlreplaceschemaschema)
      - [app.graphql.schema](#appgraphqlschema)
      - [app.graphql.transformSchema(transforms)](#appgraphqltransformschematransforms)
      - [app.graphql.defineLoaders(loaders)](#appgraphqldefineloadersloaders)
      - [reply.graphql(source, context, variables, operationName)](#replygraphqlsource-context-variables-operationname)

## API

### plugin options

**mercurius** supports the following options:

- `schema`: String, String[] or [schema
  definition](https://graphql.org/graphql-js/type/#graphqlschema). The graphql schema.
  The string will be parsed.
- `resolvers`: Object. The graphql resolvers.
- `loaders`: Object. See [defineLoaders](#defineLoaders) for more
  details.
- `schemaTransforms`: Array of schema-transformation functions. Accept a schema as an argument and return a schema.
- `graphiql`: boolean | string. Serve
  [GraphiQL](https://www.npmjs.com/package/graphiql) on `/graphiql` if `true` or `'graphiql'`, or
  [GraphQL IDE](https://www.npmjs.com/package/graphql-playground-react) on `/playground` if `'playground'`
  and if `routes` is `true`. Leave empty or `false` to disable.
  _only applies if `onlyPersisted` option is not `true`_
- `playgroundSettings` Object. that allow you to configure GraphQL Playground with [playground
  options](https://github.com/prisma-labs/graphql-playground#usage). it works if the graphiql is set to `'playground'`.
- `jit`: Integer. The minimum number of execution a query needs to be
  executed before being jit'ed.
- `routes`: boolean. Serves the Default: `true`. A graphql endpoint is
  exposed at `/graphql`.
- `path`: string. Change default graphql `/graphql` route to another one.
- `context`: `Function`. Result of function is passed to resolvers as a custom GraphQL context. The function receives the `request` and `reply` as parameters. It is only called when `routes` options is `true`
- `prefix`: String. Change the route prefix of the graphql endpoint if enabled.
- `defineMutation`: Boolean. Add the empty Mutation definition if schema is not defined (Default: `false`).
- `errorHandler`: `Function`  or `boolean`. Change the default error handler (Default: `true`). _Note: If a custom error handler is defined, it should return the standardized response format according to [GraphQL spec](https://graphql.org/learn/serving-over-http/#response)._
- `errorFormatter`: `Function`. Change the default error formatter. Allows the status code of the response to be set, and a GraphQL response for the error to be defined. This can be used to format errors for batched queries, which return a successful response overall but individual errors, or to obfuscate or format internal errors. The first argument is the error object, while the second one _might_ be the context if it is available.
- `queryDepth`: `Integer`. The maximum depth allowed for a single query. _Note: GraphiQL IDE (or Playground IDE) sends an introspection query when it starts up. This query has a depth of 7 so when the `queryDepth` value is smaller than 7 this query will fail with a `Bad Request` error_
- `validationRules`: `Function` or `Function[]`. Optional additional validation rules that the queries must satisfy in addition to those defined by the GraphQL specification. When using `Function`, arguments include additional data from graphql request and the return value must be validation rules `Function[]`.
- `subscription`: Boolean | Object. Enable subscriptions. It uses [mqemitter](https://github.com/mcollina/mqemitter) when it is true and exposes the pubsub interface to `app.graphql.pubsub`. To use a custom emitter set the value to an object containing the emitter.
  - `subscription.emitter`: Custom emitter
  - `subscription.verifyClient`: `Function` A function which can be used to validate incoming connections.
  - `subscription.context`: `Function` Result of function is passed to subscription resolvers as a custom GraphQL context. The function receives the `connection` and `request` as parameters.
  - `subscription.onConnect`: `Function` A function which can be used to validate the `connection_init` payload. If defined it should return a truthy value to authorize the connection. If it returns an object the subscription context will be extended with the returned object.
- `federationMetadata`: Boolean. Enable federation metadata support so the service can be deployed behind an Apollo Gateway
- `gateway`: Object. Run the GraphQL server in gateway mode.

  - `gateway.services`: Service[] An array of GraphQL services that are part of the gateway
    - `service.name`: A unique name for the service. Required.
    - `service.url`: The url of the service endpoint. Required
    - `service.rewriteHeaders`: `Function` A function that gets the original headers as a parameter and returns an object containing values that should be added to the headers
    - `service.initHeaders`: `Function` or `Object` An object or a function that returns the headers sent to the service for the initial \_service SDL query.
    - `service.wsUrl`: The url of the websocket endpoint
    - `service.wsConnectionParams`: `Function` or `Object`
      - `wsConnectionParams.connectionInitPayload`: `Function` or `Object` An object or a function that returns the `connection_init` payload sent to the service.
      - `wsConnectionParams.reconnect`: `Boolean` Enable reconnect on connection close (Default: `false`)
      - `wsConnectionParams.maxReconnectAttempts`: `Number` Defines the maximum reconnect attempts if reconnect is enabled (Default: `Infinity`)
      - `wsConnectionParams.connectionCallback`: `Function` A function called after a `connection_ack` message is received.
      - `wsConnectionParams.failedConnectionCallback`: `Function` A function called after a `connection_error` message is received, the first argument contains the message payload.
      - `wsConnectionParams.failedReconnectCallback`: `Function` A function called if reconnect is enabled and maxReconnectAttempts is reached.

- `persistedQueries`: A hash/query map to resolve the full query text using it's unique hash. Overrides `persistedQueryProvider`.
- `onlyPersisted`: Boolean. Flag to control whether to allow graphql queries other than persisted. When `true`, it'll make the server reject any queries that are not present in the `persistedQueries` option above. It will also disable any ide available (playground/graphiql). Requires `persistedQueries` to be set, and overrides `persistedQueryProvider`.
- `persistedQueryProvider`
  - `isPersistedQuery: (request: object) => boolean`: Return true if a given request matches the desired persisted query format.
  - `getHash: (request: object) => string`: Return the hash from a given request, or falsy if this request format is not supported.
  - `getQueryFromHash: async (hash: string) => string`: Return the query for a given hash.
  - `getHashForQuery?: (query: string) => string`: Return the hash for a given query string. Do not provide if you want to skip saving new queries.
  - `saveQuery?: async (hash: string, query: string) => void`: Save a query, given its hash.
  - `notFoundError?: string`: An error message to return when `getQueryFromHash` returns no result. Defaults to `Bad Request`.
  - `notSupportedError?: string`: An error message to return when a query matches `isPersistedQuery`, but returns no valid hash from `getHash`. Defaults to `Bad Request`.
- `allowBatchedQueries`: Boolean. Flag to control whether to allow batched queries. When `true`, the server supports recieving an array of queries and returns an array of results.

#### queryDepth example

```
query {
  dogs {
    name
    owner {
      name
      pet {
        name
        owner {
          name
          pet {
            name
          }
        }
      }
    }
  }
}
```

A `queryDepth` of `6` would allow this query. `5` or less would throw with the error - `unnamedQuery query exceeds the query depth limit of 5`

### HTTP endpoints

#### GET /graphql

Executed the GraphQL query passed via query string parameters.
The supported query string parameters are:

- `query`, the GraphQL query.
- `operationName`, the operation name to execute contained in the query.
- `variables`, a JSON object containing the variables for the query.

#### POST /graphql

Executes the GraphQL query or mutation described in the body. The
payload must conform to the following JSON schema:

```js
{
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'the GraphQL query'
    },
    operationName: {
      type: 'string'
    },
    variables: {
      type: ['object', 'null'],
      additionalProperties: true
    }
  }
}
```

For code from [example](#example) use:

```sh
curl -H "Content-Type:application/json" -XPOST -d '{"query": "query { add(x: 2, y: 2) }"}' http://localhost:3000/graphql
```

#### POST /graphql with Content-type: application/graphql

Executes the GraphQL query or mutation described in the body. `operationName` and `variables` can not be passed using this method. The
payload contains the GraphQL query.

For code from [example](#example) use:

```sh
curl -H "Content-Type:application/graphql" -XPOST -d "query { add(x: 2, y: 2) }" http://localhost:3000/graphql
```

#### GET /graphiql

Serves [GraphiQL](https://www.npmjs.com/package/graphiql) if enabled by
the options.

#### GET /playground

Serves [GraphQL IDE](https://www.npmjs.com/package/graphql-playground-react) if enabled by
the options.

### decorators

**mercurius** adds the following decorators.

#### app.graphql(source, context, variables, operationName)

Decorate [Server](https://www.fastify.io/docs/latest/Server/) with a
`graphql` method.
It calls the upstream [`graphql()`](https://graphql.org/graphql-js/graphql/) method with the
defined schema, and it adds `{ app }` to the context.

```js
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

async function run() {
  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  console.log(res)
  // prints:
  //
  // {
  //   data: {
  //      add: 4
  //   }
  // }
}

run()
```

#### app.graphql.extendSchema(schema) and app.graphql.defineResolvers(resolvers)

It is possible to add schemas and resolvers in separate fastify plugins, like so:

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const app = Fastify()
const schema = `
  extend type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y
  }
}

app.register(mercurius)

app.register(async function (app) {
  app.graphql.extendSchema(schema)
  app.graphql.defineResolvers(resolvers)
})

async function run() {
  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  console.log(res)
  // prints:
  //
  // {
  //   data: {
  //      add: 4
  //   }
  // }
}

run()
```

#### app.graphql.replaceSchema(schema)

It is possible to replace schema and resolvers using `makeSchemaExecutable` function in separate fastify plugins, like so:

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { makeExecutableSchema } = require('graphql-tools')

const app = Fastify()

app.register(mercurius, {
  schema: makeExecutableSchema({
    typeDefs: `
    type Query {
      add(x: Int, y: Int): Int
    }
  `,
    resolvers: {
      Query: {
        add: async (_, { x, y }) => x + y
      }
    }
  })
})

app.register(async function (app) {
  app.graphql.replaceSchema(
    makeExecutableSchema({
      typeDefs: `
      type Query {
        add(x: Int, y: Int, z: Int): Int
      }
    `,
      resolvers: {
        Query: {
          add: async (_, { x, y, z }) => x + y + z
        }
      }
    })
  )
})

async function run() {
  // needed so that graphql is defined

  await app.ready()

  const query = '{ add(x: 2, y: 2, z: 2) }'
  const res = await app.graphql(query)

  console.log(res)
  // prints:
  //
  // {
  //   data: {
  //      add: 6
  //   }
  // }
}

run()
```

#### app.graphql.transformSchema(transforms)

`transforms` can be an array of functions or a single function that accept the schema and returns a schema.
It is an utility function that calls `replaceSchema` underneath.

```js
app.graphql.extendSchema(typeDefs)
app.graphql.defineResolvers(resolvers)
app.graphql.transformSchema(directive()) // or [directive()]
```

#### app.graphql.schema

Provides access to the built `GraphQLSchema` object that `mercurius` will use to execute queries. This property will reflect any updates made by `extendSchema` or `replaceSchema` as well.

#### app.graphql.defineLoaders(loaders)

A loader is an utility to avoid the 1 + N query problem of GraphQL.
Each defined loader will register a resolver that coalesces each of the
request and combines them into a single, bulk query. Morever, it can
also cache the results, so that other parts of the GraphQL do not have
to fetch the same data.

Each loader function has the signature `loader(queries, context)`.
`queries` is an array of objects defined as `{ obj, params }` where
`obj` is the current object and `params` are the GraphQL params (those
are the first two parameters of a normal resolver). The `context` is the
GraphQL context, and it includes a `reply` object.

Example:

```js
const loaders = {
  Dog: {
    async owner(queries, { reply }) {
      return queries.map(({ obj }) => owners[obj.name])
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  loaders
})
```

It is also possible disable caching with:

```js
const loaders = {
  Dog: {
    owner: {
      async loader(queries, { reply }) {
        return queries.map(({ obj }) => owners[obj.name])
      },
      opts: {
        cache: false
      }
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  loaders
})
```

Disabling caching has the advantage to avoid the serialization at
the cost of more objects to fetch in the resolvers.

Internally, it uses
[single-user-cache](http://npm.im/single-user-cache).

#### reply.graphql(source, context, variables, operationName)

Decorate [Reply](https://www.fastify.io/docs/latest/Reply/) with a
`graphql` method.
It calls the upstream [`graphql()`](https://graphql.org/graphql-js/graphql/) function with the
defined schema, and it adds `{ app, reply }` to the context.

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const app = Fastify()
const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  add: async ({ x, y }) => x + y
}

app.register(mercurius, {
  schema,
  resolvers
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

async function run() {
  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  console.log(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
}

run()
```
