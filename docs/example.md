# Example

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

<a id="make-executable-schema-support"></a>
## makeExecutableSchema support

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
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

app.register(mercurius, {
  schema: makeExecutableSchema({ typeDefs, resolvers })
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)
```
<a id="persisted-queries"></a>
## Persisted Queries

GraphQL query strings are often larger than the URLs used in REST requests, sometimes by many kilobytes.

Depending on the client, this can be a significant overhead for each request, especially given that upload speed is typically the most bandwidth-constrained part of the request lifecycle. Large queries can add significant performance overheads.

Persisted Queries solve this problem by having the client send a generated ID, instead of the full query string, resulting in a smaller request. The server can use an internal lookup to turn this back into a full query and return the result.

The `persistedQueryProvider` option lets you configure this for Fastify mercurius. There are a few default options available, included in `mercurius.persistedQueryDefaults`.

### Prepared

Prepared queries give the best performance in all use cases, at the expense of tooling complexity. Queries must be hashed ahead of time, and a matching set of hashes must be available for both the client and the server. Additionally, version control of query hashes must be considered, e.g. queries used by old clients may need to be kept such that hashes can be calculated at build time. This can be very useful for non-public APIs, but is impractical for public APIs.

Clients can provide a full query string, or set the `persisted` flag to true and provide a hash instead of the query in the request:
```js
{
  query: '<hash>',
  persisted: true
}
```

A map of hashes to queries must be provided to the server at startup:
```js
const mercurius = require('mercurius')

app.register(mercurius, {
  ...
  persistedQueryProvider: mercurius.persistedQueryDefaults.prepared({
    '<hash>':  '{ add(x: 1, y: 1) }'
  })
})
```

Alternatively the `peristedQueries` option may be used directly, which will be internally mapped to the `prepared` default:
```js
const mercurius = require('mercurius')

app.register(mercurius, {
  ...
  persistedQueries: {
    '<hash>':  '{ add(x: 1, y: 1) }'
  }
})
```

### Prepared Only

This offers similar performance and considerations to the `prepared` queries, but only allows persisted queries. This provides additional secuirity benefits, but means that the server **must** know all queries ahead of time or will reject the request.

The API is the same as the `prepared` default.

Alternatively the `peristedQueries` and `onlyPersisted` options may be used directly, which will be internally mapped to the `preparedOnly` default:
```js
const mercurius = require('mercurius')

app.register(mercurius, {
  ...
  persistedQueries: {
    '<hash>': '{ add(x: 1, y: 1) }'
  },
  onlyPersisted: true
})
```

### Automatic

This default is compatible with `apollo-client`, and requires no additional tooling to set up at the cost of some performance. In order for this mode to be effective, you must have long lived server instances (i.e *not* cloud functions). This mode is also appropriate for public APIs where queries are not known ahead of time.

When an unrecognised hash is recieved by the server instance, an error is thrown informing the client that the persisted query has not been seen before. The client then re-sends the full query string. When a full query string is recieved, the server caches the hash of the query string and returns the response. *Note that sticky sessions should be used to ensure optimal performance here by making sure the follow up request is sent to the same server instance.*

The next request for that query (from the same or a different client) will already have been cached and will then be looked up accordingly.

When the server initially starts, no queries will be cached and additional latency will be added to the first requests recieved (due to the client re-sending the full query). However, the most common queries will rapidly be cached by the server. After a warmup (length dependent on the number of queries clients might send and how frequent they are) performance will match that of the `prepared` query option.

Additional documentation on Apollo's automatic persisted queries implementation can be found [here](https://www.apollographql.com/docs/apollo-server/performance/apq/).

Example:
```js
const mercurius = require('mercurius')

app.register(mercurius, {
  ...
  persistedQueryProvider: mercurius.persistedQueryDefaults.automatic()
})
```

An LRU cache is used to prevent DoS attacks on the storage of hashes & queries. The maximum size of this cache (maximum number of cached queries) can be adjusted by passing a value to the constructor, for example:

```js
const mercurius = require('mercurius')

app.register(mercurius, {
  ...
  persistedQueryProvider: mercurius.persistedQueryDefaults.automatic(5000)
})
```


### Custom Persisted Queries

It is also possible to extend or modify these persisted query implementations for custom cases, such as automatic Persisted Queries, but with a shared cache between servers.

This would enable all persisted queries to be shared between all server instances in a cache which is dynamically populated. The lookup time from the cache is an additional overhead for each request, but a higher rate of persisted query matches would be achieved. This may be beneficial, for example, in a public facing API which supports persisted queries and uses cloud functions (short lived server instances). *Note the performance impacts of this need to be considered thoroughly: the latency added to each request must be less than the savings from smaller requests.*

A example of using this with Redis would be:

```js
const mercurius = require('mercurius')

const persistedQueryProvider = {
  ...mercurius.persistedQueryDefaults.automatic(),
  getQueryFromHash: async (hash) => redis.get(hash),
  saveQuery: async (hash, query) => redis.set(hash, query),
}

app.register(mercurius, {
  ...
  persistedQueryProvider
})
```

<a id="batched-queries"></a>
## Batched Queries

Batched queries, like those sent by `apollo-link-batch-http` are supported by enabling the `allowBatchedQueries` option.

Instead a single query object, an array of queries is accepted, and the response is returned as an array of results. Errors are returned on a per query basis. Note that the response will not be returned until the slowest query has been executed.

Request:
```js
[
  {
    operationName: 'AddQuery',
    variables: { x: 1, y: 2 },
    query: 'query AddQuery ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'
  },
  {
    operationName: 'DoubleQuery',
    variables: { x: 1 },
    query: 'query DoubleQuery ($x: Int!) { add(x: $x, y: $x) }'
  },
  {
    operationName: 'BadQuery',
    query: 'query DoubleQuery ($x: Int!) {---' // Malformed Query
  }
]
```

Response:
```js
[
  {
    data: { add: 3 }
  },
  {
    data: { add: 2 }
  },
  {
    errors: [{ message: 'Bad Request' }]
  }
]
```

<a id="access-app-context-in-resolver"></a>
## Access app context in resolver

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

<a link="build-a-custom-graphql-context-object"></a>
## Build a custom GraphQL context object

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
app.register(mercurius, {
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

<a link="subscription-support-simple"></a>
## Subscription support (simple)

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
      // You can also subscribe to multiple topics at once using an array like this:
      //  pubsub.subscribe(['TOPIC1', 'TOPIC2'])
      subscribe: async (root, args, { pubsub }) => await pubsub.subscribe('NOTIFICATION_ADDED')
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: true
})
```

<a link="build-a-custom-graphql-context-object-for-subscriptions"></a>
## Build a custom GraphQL context object for subscriptions

```js
...
const resolvers = {
  Mutation: {
    sendMessage: async (_, { message, userId }, { pubsub }) => {
      await pubsub.publish({
        topic: userId,
        payload: message
      })

      return "OK"
    }
  },
  Subscription: {
    receivedMessage: {
      // If someone calls the sendMessage mutation with the Id of the user that was added
      // to the subscription context, that user receives the message.
      subscribe: (root, args, { pubsub, user }) => pubsub.subscribe(user.id)
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: {
      // Add the decoded JWT from the Authorization header to the subscription context.
      context: (_, req) => ({ user: jwt.verify(req.headers["Authorization"].slice(7))})
  }
})
...
```

<a link="subscription-support-with-redis"></a>
## Subscription support (with redis)

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

app.register(mercurius, {
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

<a link="federation-metadata-support"></a>
## Federation metadata support

The signature of the method is the same as a standard resolver: `__resolveReference(source, args, context, info)` where the `source` will contain the reference object that needs to be resolved.

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')

const users = {
  1: {
    id: '1',
    name: 'John',
    username: '@john'
  },
  2: {
    id: '2',
    name: 'Jane',
    username: '@jane'
  }
}

const app = Fastify()
const schema = `
  extend type Query {
    me: User
  }

  type User @key(fields: "id") {
    id: ID!
    name: String
    username: String
  }
`

const resolvers = {
  Query: {
    me: () => {
      return users['1']
    }
  },
  User: {
    __resolveReference: (source, args, context, info) => {
      return users[source.id]
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  federationMetadata: true
})

app.get('/', async function (req, reply) {
  const query = '{ _service { sdl } }'
  return app.graphql(query)
})

app.listen(3000)
```

<a link="federation-with-__resolvereference-caching"></a>
## Federation with __resolveReference caching

Just like standard resolvers, the `__resolveReference` resolver can be a performance bottleneck. To avoid this, the it is strongly recommended to define the `__resolveReference` function for an entity as a [loader](#defineLoaders).

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')

const users = {
  1: {
    id: '1',
    name: 'John',
    username: '@john'
  },
  2: {
    id: '2',
    name: 'Jane',
    username: '@jane'
  }
}

const app = Fastify()
const schema = `
  extend type Query {
    me: User
  }

  type User @key(fields: "id") {
    id: ID!
    name: String
    username: String
  }
`

const resolvers = {
  Query: {
    me: () => {
      return users['1']
    }
  }
}

const loaders = {
  User: {
    async __resolveReference(queries, context) {
      // This should be a bulk query to the database
      return queries.map(({ obj }) => users[obj.id])
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  loaders,
  federationMetadata: true
})

app.get('/', async function (req, reply) {
  const query = '{ _service { sdl } }'
  return app.graphql(query)
})

app.listen(3000)
```

<a link="use-graphql-server-as-a-gateway-for-federated-schemas"></a>
## Use GraphQL server as a Gateway for federated schemas

A GraphQL server can act as a Gateway that composes the schemas of the underlying services into one federated schema and executes queries across the services. Every underlying service must be a GraphQL server that supports the federation.

In Gateway mode the following options are not allowed (the plugin will throw an error if any of them are defined):

- `schema`
- `resolvers`
- `loaders`

Also, using the following decorator methods will throw:

- `app.graphql.defineResolvers`
- `app.graphql.defineLoaders`
- `app.graphql.extendSchema`

```js
const gateway = Fastify()
const mercurius = require('mercurius')

gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        rewriteHeaders: (headers) => {
          if (headers.authorization) {
            return {
              authorization: headers.authorization
            }
          }

          return {
            'x-api-key': 'secret-api-key'
          }
        }
      },
      {
        name: 'post',
        url: 'http://localhost:4002/graphql'
      }
    ]
  }
})

await gateway.listen(4000)
```

### Periodically refresh federated schemas in Gateway mode

The Gateway service can obtain new versions of federated schemas automatically within a defined polling interval using the following configuration:

- `gateway.pollingInterval` defines the interval (in milliseconds) the gateway should use in order to look for schema changes from the federated services. If the received schema is unchanged, the previously cached version will be reused.

```js
const gateway = Fastify();
const mercurius = require("mercurius");

gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: "user",
        url: `http://localhost:3000/graphql`,
      },
    ],
    pollingInterval: 2000,
  },
});

gateway.listen(3001);
```

### Programmatically refresh federated schemas in Gateway mode

The service acting as the Gateway can manually trigger re-fetching the federated schemas programmatically by calling the `application.graphql.gateway.refresh()` method. The method either returns the newly generated schema or `null` if no changes have been discovered.

```js
const Fastify = require("fastify");
const mercurius = require("mercurius");

const server = Fastify();

server.register(mercurius, {
  graphiql: "playground",
  gateway: {
    services: [
      {
        name: "user",
        url: "http://localhost:3000/graphql",
      },
      {
        name: "company",
        url: "http://localhost:3001/graphql",
      },
    ],
  },
});

server.listen(3002);

setTimeout(async () => {
  const schema = await server.graphql.gateway.refresh();

  if (schema !== null) {
    server.graphql.replaceSchema(schema);
  }
}, 10000);
```

### Flag a service as mandatory in Gateway mode

A Gateway service can handle the federated services in 2 different modes, `mandatory` or not by utilizing the `gateway.services.mandatory` configuration flag. If a service is not considered mandatory, creating the federated schema will succeed even if the service isn't capable of delivering a schema. By default, all services are consideredmandatory. Note: At least 1 service is necessary in order to create a valid federated schema.

```js
const Fastify = require("fastify");
const mercurius = require("mercurius");

const server = Fastify();

server.register(mercurius, {
  graphiql: "playground",
  gateway: {
    services: [
      {
        name: "user",
        url: "http://localhost:3000/graphql",
        mandatory: true,
      },
      {
        name: "company",
        url: "http://localhost:3001/graphql",
      },
    ],
  },
  pollingInterval: 2000,
});

server.listen(3002);
```

### Using a custom errorHandler for handling downstream service errors in Gateway mode

Service which uses Gateway mode can process different types of issues that can be obtained from remote services (for example, Network Error, Downstream Error, etc.). A developer can provide a function (`gateway.errorHandler`) that can process these errors.

```js
const Fastify = require("fastify");
const mercurius = require("mercurius");

const server = Fastify();

server.register(mercurius, {
  graphiql: "playground",
  gateway: {
    services: [
      {
        name: "user",
        url: "http://localhost:3000/graphql",
        mandatory: true,
      },
      {
        name: "company",
        url: "http://localhost:3001/graphql",
      },
    ],
  },
  pollingInterval: 2000,
  errorHandler: (error, service) => {
    if (service.mandatory) {
      logger.error(error);
    }
  },
});

server.listen(3002);
```

_Note: The default behavior of `errorHandler` is call `errorFormatter` to send the result. When is provided an `errorHandler` make sure to **call `errorFormatter` manually if needed**._

<a link="use-errors-extension-to-provide-additional-information-to-query-errors"></a>
## Use errors extension to provide additional information to query errors

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
      else throw new ErrorWithProps('Invalid User ID', { id, code: "USER_ID_INVALID", timestamp: Math.round(new Date().getTime()/1000) })
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.listen(3000)
```