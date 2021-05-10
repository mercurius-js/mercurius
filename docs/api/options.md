# mercurius

- [Plugin options](#plugin-options)
- [HTTP endpoints](#http-endpoints)
  - [GET /graphql](#get-graphql)
  - [POST /graphql](#post-graphql)
  - [POST /graphql with Content-type: application/graphql](#post-graphql-with-content-type-applicationgraphql)
  - [GET /graphiql](#get-graphiql)
  - [GET /playground](#get-playground)
- [Decorators](#decorators)
  - [app.graphql(source, context, variables, operationName)](#appgraphqlsource-context-variables-operationname)
  - [app.graphql.extendSchema(schema), app.graphql.defineResolvers(resolvers) and app.graphql.defineLoaders(loaders)](#appgraphqlextendschemaschema-appgraphqldefineresolversresolvers-and-appgraphqldefineloadersloaders)
  - [app.graphql.replaceSchema(schema)](#appgraphqlreplaceschemaschema)
  - [app.graphql.transformSchema(transforms)](#appgraphqltransformschematransforms)
  - [app.graphql.schema](#appgraphqlschema)
  - [reply.graphql(source, context, variables, operationName)](#replygraphqlsource-context-variables-operationname)
- [Error extensions](#use-errors-extension-to-provide-additional-information-to-query-errors)

## API

### Plugin options

**mercurius** supports the following options:

- `schema`: String, String[] or [schema
  definition](https://graphql.org/graphql-js/type/#graphqlschema). The graphql schema.
  The string will be parsed.
- `resolvers`: Object. The graphql resolvers.
- `loaders`: Object. See [defineLoaders](#appgraphqlextendschemaschema-appgraphqldefineresolversresolvers-and-appgraphqldefineloadersloaders) for more
  details.
- `schemaTransforms`: Array of schema-transformation functions. Accept a schema as an argument and return a schema.
- `graphiql`: boolean | string. Serve
  [GraphiQL](https://www.npmjs.com/package/graphiql) on `/graphiql` if `true` or `'graphiql'`. If `'playground'` is provided it will serve [GraphQL IDE](https://www.npmjs.com/package/graphql-playground-react) on `/playground`. Leave empty or `false` to disable.
  _only applies if `onlyPersisted` option is not `true`_

  **Note:** If you are working with subscription is recommended to set 'playground' for testing proposes. See [283](https://github.com/mercurius-js/mercurius/issues/283).

  **Note**: If `routes` is false, set `playground` does not have effects.

- `playgroundSettings` Object. that allow you to configure GraphQL Playground with [playground
  options](https://github.com/prisma-labs/graphql-playground#usage). it works if the graphiql is set to `'playground'`.
- `playgroundHeaders` Object | Function. It provides HTTP headers to GraphQL Playground. If it is an object, it is provided as-is. If it is a function, it is serialized, injected in the generated HTML and invoked with the `window` object as the argument. Useful to read authorization token from browser's storage. See [examples/playground.js](https://github.com/mercurius-js/mercurius/blob/master/examples/playground.js).
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
  - `subscription.emitter`: Custom emitter.
  - `subscription.pubsub`: Custom pubsub, see [Subscriptions with custom PubSub](/docs/subscriptions.md#subscriptions-with-custom-pubsub) for more details. Note that when passing both `emitter` and `pubsub` options, `emitter` will be ignored.
  - `subscription.verifyClient`: `Function` A function which can be used to validate incoming connections.
  - `subscription.context`: `Function` Result of function is passed to subscription resolvers as a custom GraphQL context. The function receives the `connection` and `request` as parameters.
  - `subscription.onConnect`: `Function` A function which can be used to validate the `connection_init` payload. If defined it should return a truthy value to authorize the connection. If it returns an object the subscription context will be extended with the returned object.
  - `subscription.onDisconnect`: `Function` A function which is called with the subscription context of the connection after the connection gets disconnected.
- `federationMetadata`: Boolean. Enable federation metadata support so the service can be deployed behind an Apollo Gateway
- `gateway`: Object. Run the GraphQL server in gateway mode.

  - `gateway.services`: Service[] An array of GraphQL services that are part of the gateway
    - `service.name`: A unique name for the service. Required.
    - `service.url`: The url of the service endpoint. Required
    - `service.mandatory`: `Boolean` Marks service as mandatory. If any of the mandatory services are unavailable, gateway will exit with an error. (Default: `false`)
    - `service.rewriteHeaders`: `Function` A function that gets the original headers as a parameter and returns an object containing values that should be added to the headers
    - `service.initHeaders`: `Function` or `Object` An object or a function that returns the headers sent to the service for the initial \_service SDL query.
    - `service.connections`: The number of clients to create. (Default: `10`)
    - `service.bodyTimeout`: The timeout after which a request will time out, in milliseconds. (Default: `30e3` - 30 seconds)
    - `service.headersTimeout`: The amount of time the parser will wait to receive the complete HTTP headers, in milliseconds. (Default: `30e3` - 30 seconds)
    - `service.keepAliveMaxTimeout`: The maximum allowed keepAliveTimeout. (Default: `5e3` - 5 seconds)
    - `service.maxHeaderSize`: The maximum length of request headers in bytes. (Default: `16384` - 16KiB)
    - `service.wsUrl`: The url of the websocket endpoint
    - `service.wsConnectionParams`: `Function` or `Object`
      - `wsConnectionParams.connectionInitPayload`: `Function` or `Object` An object or a function that returns the `connection_init` payload sent to the service.
      - `wsConnectionParams.reconnect`: `Boolean` Enable reconnect on connection close (Default: `false`)
      - `wsConnectionParams.maxReconnectAttempts`: `Number` Defines the maximum reconnect attempts if reconnect is enabled (Default: `Infinity`)
      - `wsConnectionParams.connectionCallback`: `Function` A function called after a `connection_ack` message is received.
      - `wsConnectionParams.failedConnectionCallback`: `Function` A function called after a `connection_error` message is received, the first argument contains the message payload.
      - `wsConnectionParams.failedReconnectCallback`: `Function` A function called if reconnect is enabled and maxReconnectAttempts is reached.
      - `wsConnectionParams.rewriteConnectionInitPayload`: `Function` A function that gets the original `connection_init` payload along with the context as a parameter and returns an object that replaces the original `connection_init` payload before forwarding it to the federated service

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

For code from [example](/#quick-start) use:

```bash
curl -H "Content-Type:application/json" -XPOST -d '{"query": "query { add(x: 2, y: 2) }"}' http://localhost:3000/graphql
```

#### POST /graphql with Content-type: application/graphql

Executes the GraphQL query or mutation described in the body. `operationName` and `variables` can not be passed using this method. The
payload contains the GraphQL query.

For code from [example](/#quick-start) use:

```bash
curl -H "Content-Type:application/graphql" -XPOST -d "query { add(x: 2, y: 2) }" http://localhost:3000/graphql
```

#### GET /graphiql

Serves [GraphiQL](https://www.npmjs.com/package/graphiql) if enabled by
the options.

#### GET /playground

Serves [GraphQL IDE](https://www.npmjs.com/package/graphql-playground-react) if enabled by
the options.

### Decorators

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

#### app.graphql.extendSchema(schema), app.graphql.defineResolvers(resolvers) and app.graphql.defineLoaders(loaders)

It is possible to add schemas, resolvers and loaders in separate fastify plugins, like so:

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const app = Fastify()
const schema = `
  type Human {
    name: String!
  }

  type Dog {
    name: String!
    owner: Human
  }

  extend type Query {
    dogs: [Dog]
    add(x: Int, y: Int): Int
  }
`

const dogs = [
  { name: 'Max' },
  { name: 'Charlie' },
  { name: 'Buddy' },
  { name: 'Max' }
]

const owners = {
  Max: {
    name: 'Jennifer'
  },
  Charlie: {
    name: 'Sarah'
  },
  Buddy: {
    name: 'Tracy'
  }
}

const resolvers = {
  Query: {
    dogs: async (_, args, context, info) => dogs,
     add: async (_, { x, y }) => x + y
  }
}

const loaders = {
  Dog: {
    async owner(queries, { reply }) {
      return queries.map(({ obj }) => owners[obj.name])
    }
  }
}

app.register(mercurius)

app.register(async function (app) {
  app.graphql.extendSchema(schema)
  app.graphql.defineResolvers(resolvers)
  app.graphql.defineLoaders(loaders)
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

Note: `app.graphql.extendSchema` is not allowed if `federationMetadata` is enabled.

#### app.graphql.replaceSchema(schema)

It is possible to replace schema and resolvers using `makeSchemaExecutable` function in separate fastify plugins, like so:

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { makeExecutableSchema } = require('@graphql-tools/schema')

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

### Use errors extension to provide additional information to query errors

GraphQL services may provide an additional entry to errors with the key `extensions` in the result.

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const { ErrorWithProps } = mercurius

const users = {
  1: {
    id: '1',
    name: 'John'
  },
  2: {
    id: '2',
    name: 'Jane'
  }
}

const app = Fastify()
const schema = `
  type Query {
    findUser(id: String!): User
  }

  type User {
    id: ID!
    name: String
  }
`

const resolvers = {
  Query: {
    findUser: (_, { id }) => {
      const user = users[id]
      if (user) return users[id]
      else
        throw new ErrorWithProps('Invalid User ID', {
          id,
          code: 'USER_ID_INVALID',
          timestamp: Math.round(new Date().getTime() / 1000)
        })
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.listen(3000)
```
