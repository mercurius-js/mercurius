# fastify-gql

[![Greenkeeper badge](https://badges.greenkeeper.io/mcollina/fastify-gql.svg)](https://greenkeeper.io/) [![Build Status](https://travis-ci.com/mcollina/fastify-gql.svg?branch=master)](https://travis-ci.com/mcollina/fastify-gql)

Fastify barebone GraphQL adapter.

Features:

* Caching of query parsing and validation.
* Automatic loader integration to avoid 1 + N queries.
* Just-In-Time compiler via [graphql-jit](http://npm.im/graphql-jit).

## Install

```
npm i fastify fastify-gql
```

## Example

```js
'use strict'

const Fastify = require('fastify')
const GQL = require('fastify-gql')

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

app.register(GQL, {
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
const GQL = require('fastify-gql')
const { makeExecutableSchema } = require('graphql-tools')

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

app.register(GQL, {
  schema: makeExecutableSchema({ typeDefs, resolvers })
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)
```

### Access app context in resolver

```js
...

const resolvers = {
  Query: {
    add: async (_, { x, y }, context) => {
      // do you need the request object?
      console.log(context.reply.request)
      return x + y
    }
  }
}

...
```

### Build a custom GraphQL context object

```js
...
const resolvers = {
  Query: {
    me: async (obj, args, ctx) => {
      // access user_id in ctx
      console.log(ctx.user_id)
    }
  }
}
app.register(GQL, {
  schema: makeExecutableSchema({ typeDefs, resolvers }),
  context: (request, reply) => {
    // Return an object that will be available in your GraphQL resolvers
    return {
        user_id: 1234
    }
  }
})
...
```

### Subscription support (simple)

```js
const schema = `
  type Notification {
    id: ID!
    message: String
  }

  type Query {
    notifications: [Notification]
  }

  type Mutation {
    addNotification(message: String): Notification
  }

  type Subscription {
    notificationAdded: Notification
  }
`

let idCount = 1
const notifications = [{
  id: idCount,
  message: 'Notification message'
}]

const resolvers = {
  Query: {
    notifications: () => notifications
  },
  Mutation: {
    addNotification: async (_, { message }, { pubsub }) => {
      const id = idCount++
      const notification = {
        id,
        message
      }
      notifications.push(notification)
      await pubsub.publish({
        topic: 'NOTIFICATION_ADDED',
        payload: {
          notificationAdded: notification
        }
      })

      return notification
    }
  },
  Subscription: {
    notificationAdded: {
      subscribe: async (root, args, { pubsub }) => await pubsub.subscribe('NOTIFICATION_ADDED')
    }
  }
}

app.register(GQL, {
  schema,
  resolvers,
  subscription: true
})
```

### Subscription support (with redis)

```js
const redis = require('mqemitter-redis')
const emitter = redis({
  port: 6579,
  host: '127.0.0.1'
})

const schema = `
  type Vote {
    id: ID!
    title: String!
    ayes: Int
    noes: Int
  }

  type Query {
    votes: [Vote]
  }

  type Mutation {
    voteAye(voteId: ID!): Vote
    voteNo(voteId: ID!): Vote
  }

  type Subscription {
    voteAdded(voteId: ID!): Vote
  }
`
const votes = []
const VOTE_ADDED = 'VOTE_ADDED';

const resolvers = {
  Query: {
    votes: async () => votes
  },
  Mutation: {
    voteAye: async (_, { voteId }, { pubsub }) => {
      if (voteId <= votes.length) {
        votes[voteId - 1].ayes++;
        await pubsub.publish(
          {
            topic: `VOTE_ADDED_${voteId}`,
            payload: {
              voteAdded: votes[voteId - 1]
            }
          }
        );

        return votes[voteId - 1];
      }

      throw new Error('Invalid vote id');
    },
    voteNo: async (_, { voteId }, { pubsub }) => {
      if (voteId <= votes.length) {
        votes[voteId - 1].noes++;
        await pubsub.publish(
          {
            topic: `VOTE_ADDED_${voteId}`,
            payload: {
              voteAdded: votes[voteId - 1]
            }
          }
        );

        return votes[voteId - 1];
      }

      throw new Error('Invalid vote id');
    }
  },
  Subscription: {
    voteAdded: {
      subscribe: async (root, { voteId }, { pubsub }) => {
        // subscribe only for a vote with a given id
        return await pubsub.subscribe(`VOTE_ADDED_${voteId}`);
      }
    }
  }
};

app.register(GQL, {
  schema,
  resolvers,
  subscription: {
    emitter,
    verifyClient: (info, next) => {
      if (info.req.headers['x-fastify-header'] !== 'fastify is awesome !') {
        return next(false) // the connection is not allowed
      }
      next(true) // the connection is allowed
    }
  }
})
```

## API

### plugin options

__fastify-gql__ supports the following options:

* `schema`: String or [schema
  definition](https://graphql.org/graphql-js/type/#graphqlschema). The graphql schema.
  The string will be parsed.
* `resolvers`: Object. The graphql resolvers.
* `loaders`: Object. See [defineLoaders](#defineLoaders) for more
  details.
* `graphiql`: boolean | string. Serve
  [GraphiQL](https://www.npmjs.com/package/graphiql) on `/graphiql` if `true` or `'graphiql'`, or
  [GraphQL IDE](https://www.npmjs.com/package/graphql-playground-react) on `/playground` if `'playground'`
  and if `routes` is `true`. Leave empty or `false` to disable.
* `jit`: Integer. The minimum number of execution a query needs to be
  executed before being jit'ed.
* `routes`: boolean. Serves the Default: `true`. A graphql endpoint is
  exposed at `/graphql`.
* `path`: string. Change default graphql `/graphql` route to another one.
* `context`: `Function`. Result of function is passed to resolvers as a custom GraphQL context. The function receives the `request` and `reply` as parameters. It is only called when `routes` options is `true`
* `prefix`: String. Change the route prefix of the graphql endpoint if enabled.
* `defineMutation`: Boolean. Add the empty Mutation definition if schema is not defined (Default: `false`).
* `errorHandler`: `Function`  or `boolean`. Change the default error handler (Default: `true`). _Note: If a custom error handler is defined, it should return the standardized response format according to [GraphQL spec](https://graphql.org/learn/serving-over-http/#response)._
* `queryDepth`: `Integer`. The maximum depth allowed for a single query.
* `subscription`: Boolean | Object. Enable subscriptions. It is uses [mqemitter](https://github.com/mcollina/mqemitter) when it is true. To use a custom emitter set the value to an object containing the emitter.
  * `subscription.emitter`: Custom emitter
  * `subscription.verifyClient`: `Function` A function which can be used to validate incoming connections.

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

* `query`, the GraphQL query.
* `operationName`, the operation name to execute contained in the query.
* `variables`, a JSON object containing the variables for the query.

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

__fastify-gql__ adds the following decorators.

#### app.graphql(source, context, variables, operationName)

Decorate [Server](https://www.fastify.io/docs/latest/Server/) with a
`graphql` method.
It calls the upstream [`graphql()`](https://graphql.org/graphql-js/graphql/) method with the
defined schema, and it adds `{ app }` to the context.

```js
const Fastify = require('fastify')
const GQL = require('fastify-gql')

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

app.register(GQL, {
  schema,
  resolvers
})

async function run () {
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
const GQL = require('fastify-gql')

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

app.register(GQL)

app.register(async function (app) {
  app.graphql.extendSchema(schema)
  app.graphql.defineResolvers(resolvers)
})

async function run () {
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
const GQL = require('fastify-gql')
const { makeExecutableSchema } = require('graphql-tools')

const app = Fastify()

app.register(GQL, {
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

async function run () {
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

<a name="loaders"></a>
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
    async owner (queries, { reply }) {
      return queries.map(({ obj }) => owners[obj.name])
    }
  }
}

app.register(GQL, {
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
      async loader (queries, { reply }) {
        return queries.map(({ obj }) => owners[obj.name])
      },
      opts: {
        cache: false
      }
    }
  }
}

app.register(GQL, {
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
const GQL = require('fastify-gql')

const app = Fastify()
const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  add: async ({ x, y }) => x + y
}

app.register(GQL, {
  schema,
  resolvers
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

async function run () {
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

## License

MIT
