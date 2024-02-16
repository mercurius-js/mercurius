# mercurius

- [mercurius](#mercurius)
  - [API](#api)
    - [Plugin options](#plugin-options)
      - [queryDepth example](#querydepth-example)
    - [HTTP endpoints](#http-endpoints)
      - [GET /graphql](#get-graphql)
      - [POST /graphql](#post-graphql)
      - [POST /graphql with Content-type: application/graphql](#post-graphql-with-content-type-applicationgraphql)
      - [GET /graphiql](#get-graphiql)
    - [Decorators](#decorators)
      - [app.graphql(source, context, variables, operationName)](#appgraphqlsource-context-variables-operationname)
      - [app.graphql.extendSchema(schema), app.graphql.defineResolvers(resolvers) and app.graphql.defineLoaders(loaders)](#appgraphqlextendschemaschema-appgraphqldefineresolversresolvers-and-appgraphqldefineloadersloaders)
      - [app.graphql.replaceSchema(schema)](#appgraphqlreplaceschemaschema)
      - [app.graphql.transformSchema(transforms)](#appgraphqltransformschematransforms)
      - [app.graphql.schema](#appgraphqlschema)
      - [reply.graphql(source, context, variables, operationName)](#replygraphqlsource-context-variables-operationname)
    - [Errors](#errors)
    - [ErrorWithProps](#errorwithprops)
      - [Extensions](#extensions)
      - [Status code](#status-code)
    - [Error formatter](#error-formatter)
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
- `graphql`: Object. Override options for graphql function that Mercurius utilizes.
  - `parseOptions`: Object. [GraphQL's parse function options](https://github.com/graphql/graphql-js/blob/main/src/language/parser.ts)
  - `validateOptions`: Object. [GraphQL's validate function options](https://github.com/graphql/graphql-js/blob/main/src/validation/validate.ts)
- `graphiql`: boolean | string | Object. Serve
  [GraphiQL](https://www.npmjs.com/package/graphiql) on `/graphiql` if `true` or `'graphiql'`. Leave empty or `false` to disable.
  _only applies if `onlyPersisted` option is not `true`_
  
  An object can be passed in the config to allow the injection of external graphiql plugins exported in `umd` format.
  - enabled: boolean, default `true`. Enable disable the graphiql extension
  - plugins: Array
    - `name`: string. The name of the plugin, it should be the same exported in the `umd`
    - `props`: Object | undefined. The props to be passed to the plugin
    - `umdUrl`: string. The urls of the plugin, it's downloaded at runtime. (eg. https://unpkg.com/myplugin/....)
    - `fetcherWrapper`: string. A function name exported by the plugin to read/enrich the fetch response

  Check the [`example folder`](https://github.com/mercurius-js/mercurius/tree/master/examples) for detailed usage or this [document](/examples/graphiql-plugin/README.md) for a detailed explanation on how to build a plugin.

  **Note**: If `routes` is false, this option does not have effects.

- `jit`: Integer. The minimum number of execution a query needs to be
  executed before being jit'ed.
  - Default: `0`, jit is disabled.
- `routes`: boolean. Serves the Default: `true`. A graphql endpoint is
  exposed at `/graphql`.
- `path`: string. Change default graphql `/graphql` route to another one.
- `context`: `Function`. Result of function is passed to resolvers as a custom GraphQL context. The function receives the `request` and `reply` as parameters. It is only called when `routes` options is `true`
- `prefix`: String. Change the route prefix of the graphql endpoint if enabled.
- `defineMutation`: Boolean. Add the empty Mutation definition if schema is not defined (Default: `false`).
- `errorHandler`: `Function`  or `boolean`. Change the default error handler (Default: `true`). _Note: If a custom error handler is defined, it should return the standardized response format according to [GraphQL spec](https://graphql.org/learn/serving-over-http/#response)._
- `errorFormatter`: `Function`. Change the default error formatter. Allows the status code of the response to be set, and a GraphQL response for the error to be defined. This can be used to format errors for batched queries, which return a successful response overall but individual errors, or to obfuscate or format internal errors. The first argument is the `ExecutionResult` object, while the second one is the context object.
- `queryDepth`: `Integer`. The maximum depth allowed for a single query. _Note: GraphiQL IDE sends an introspection query when it starts up. This query has a depth of 7 so when the `queryDepth` value is smaller than 7 this query will fail with a `Bad Request` error_
- `validationRules`: `Function` or `Function[]`. Optional additional validation rules that the queries must satisfy in addition to those defined by the GraphQL specification. When using `Function`, arguments include additional data from graphql request and the return value must be validation rules `Function[]`.
- `subscription`: Boolean | Object. Enable subscriptions. It uses [mqemitter](https://github.com/mcollina/mqemitter) when it is true and exposes the pubsub interface to `app.graphql.pubsub`. To use a custom emitter set the value to an object containing the emitter.
  - `subscription.emitter`: Custom emitter.
  - `subscription.pubsub`: Custom pubsub, see [Subscriptions with custom PubSub](/docs/subscriptions.md#subscriptions-with-custom-pubsub) for more details. Note that when passing both `emitter` and `pubsub` options, `emitter` will be ignored.
  - `subscription.verifyClient`: `Function` A function which can be used to validate incoming connections.
  - `subscription.context`: `Function` Result of function is passed to subscription resolvers as a custom GraphQL context. The function receives the `connection` and `request` as parameters.
  - `subscription.onConnect`: `Function` A function which can be used to validate the `connection_init` payload. If defined it should return a truthy value to authorize the connection. If it returns an object the subscription context will be extended with the returned object.
  - `subscription.onDisconnect`: `Function` A function which is called with the subscription context of the connection after the connection gets disconnected.
  - `subscription.keepAlive`: `Integer` Optional interval in ms to send the `GQL_CONNECTION_KEEP_ALIVE` message.
  - `subscription.fullWsTransport`: `Boolean` Enable sending every operation via WS.

- `persistedQueries`: A hash/query map to resolve the full query text using it's unique hash. Overrides `persistedQueryProvider`.
- `onlyPersisted`: Boolean. Flag to control whether to allow graphql queries other than persisted. When `true`, it'll make the server reject any queries that are not present in the `persistedQueries` option above. It will also disable any ide available (graphiql). Requires `persistedQueries` to be set, and overrides `persistedQueryProvider`.
- `persistedQueryProvider`
  - `isPersistedQuery: (request: object) => boolean`: Return true if a given request matches the desired persisted query format.
  - `getHash: (request: object) => string`: Return the hash from a given request, or falsy if this request format is not supported.
  - `getQueryFromHash: async (hash: string) => string`: Return the query for a given hash.
  - `getHashForQuery?: (query: string) => string`: Return the hash for a given query string. Do not provide if you want to skip saving new queries.
  - `saveQuery?: async (hash: string, query: string) => void`: Save a query, given its hash.
  - `notFoundError?: string`: An error message to return when `getQueryFromHash` returns no result. Defaults to `Bad Request`.
  - `notSupportedError?: string`: An error message to return when a query matches `isPersistedQuery`, but returns no valid hash from `getHash`. Defaults to `Bad Request`.
- `allowBatchedQueries`: Boolean. Flag to control whether to allow batched queries. When `true`, the server supports recieving an array of queries and returns an array of results.

- `compilerOptions`: Object. Configurable options for the graphql-jit compiler. For more details check https://github.com/zalando-incubator/graphql-jit
- `additionalRouteOptions`: Object. Takes similar configuration to the Route Options of Fastify. Use cases include being able to add constraints, modify validation schema, increase the `bodyLimit`, etc. You can read more about the possible values on [fastify.dev's Routes Options](https://fastify.dev/docs/latest/Reference/Routes/#options)

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

### Errors
Mercurius help the error handling with two useful tools.

- ErrorWithProps class
- ErrorFormatter option

### ErrorWithProps

ErrorWithProps can be used to create Errors to be thrown inside the resolvers or plugins.

it takes 3 parameters:

- message
- extensions
- statusCode

```js
'use strict'

throw new ErrorWithProps('message', {
    ...
}, 200)
```

#### Extensions

Use errors `extensions` to provide additional information to query errors

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

app.listen({ port: 3000 })
```

#### Status code

To control the status code for the response, the third optional parameter can be used.

```js
throw new mercurius.ErrorWithProps('Invalid User ID', {moreErrorInfo})
// using the defaultErrorFormatter, the response statusCode will be 200 as defined in the graphql-over-http spec

throw new mercurius.ErrorWithProps('Invalid User ID', {moreErrorInfo}, 500)
// using the defaultErrorFormatter, the response statusCode will be 500 as specified in the parameter

const error = new mercurius.ErrorWithProps('Invalid User ID', {moreErrorInfo}, 500)
error.data = {foo: 'bar'}
throw error
// using the defaultErrorFormatter, the response status code will be always 200 because error.data is defined
```

### Error formatter

Allows the status code of the response to be set, and a GraphQL response for the error to be defined. You find out how to do this [here](../http.md#custom-behaviour).

By default uses the `defaultErrorFormatter`, but it can be overridden in the [mercurius options](/docs/api/options.md#plugin-options) changing the errorFormatter parameter.

**Important**: *using the default formatter, when the error has a data property the response status code will be always 200*

While using custom error formatter, you can access the status code provided by the ErrorWithProps object via
`originalError` property. Please keep in mind though, that `originalError` is a non-enumerable property, meaning it won't
get serialized and/or logged as a whole.

```javascript
app.register(mercurius, {
    schema,
    resolvers,
    errorFormatter: (result) => ({ statusCode: result.errors[0].originalError.statusCode, response: result })
})
```

Using the errorFormatter means overriding the `defaultErrorFormatter` and it could cause ambiguous GraphQL error message like `GraphQL validation error` without indicating where and why the error happens. To retain the default error behaviour, you can reimplement the `defaultErrorFormatter`.
```javascript
import mercurius from 'mercurius';
const { defaultErrorFormatter } = mercurius;

app.register(mercurius, {
    schema,
    resolvers,
    errorFormatter: (result, context) => {
      const formatter = defaultErrorFormatter(result, context);

      // your custom behaviour here

      return {
        statusCode: formatter.statusCode || 500,
        response: formatter.response,
      };
    },
});

```
