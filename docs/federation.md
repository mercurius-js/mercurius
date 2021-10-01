# mercurius

- [Federation metadata support](#federation-metadata-support)
- [Federation with \_\_resolveReference caching](#federation-with-__resolvereference-caching)
- [Use GraphQL server as a Gateway for federated schemas](#use-graphql-server-as-a-gateway-for-federated-schemas)
  - [Periodically refresh federated schemas in Gateway mode](#periodically-refresh-federated-schemas-in-gateway-mode)
  - [Programmatically refresh federated schemas in Gateway mode](#programmatically-refresh-federated-schemas-in-gateway-mode)
  - [Using Gateway mode with a schema registry](#using-gateway-mode-with-a-schema-registry)
  - [Flag service as mandatory in Gateway mode](#flag-service-as-mandatory-in-gateway-mode)
  - [Using a custom errorHandler for handling downstream service errors in Gateway mode](#using-a-custom-errorhandler-for-handling-downstream-service-errors-in-gateway-mode)

## Federation

### Federation metadata support

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

### Federation with \_\_resolveReference caching

Just like standard resolvers, the `__resolveReference` resolver can be a performance bottleneck. To avoid this, the it is strongly recommended to define the `__resolveReference` function for an entity as a [loader](/docs/loaders.md).

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

### Use GraphQL server as a Gateway for federated schemas

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
        rewriteHeaders: (headers, context) => {
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

#### Periodically refresh federated schemas in Gateway mode

The Gateway service can obtain new versions of federated schemas automatically within a defined polling interval using the following configuration:

- `gateway.pollingInterval` defines the interval (in milliseconds) the gateway should use in order to look for schema changes from the federated services. If the received schema is unchanged, the previously cached version will be reused.

```js
const gateway = Fastify()
const mercurius = require('mercurius')

gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: `http://localhost:3000/graphql`
      }
    ],
    pollingInterval: 2000
  }
})

gateway.listen(3001)
```

#### Programmatically refresh federated schemas in Gateway mode

The service acting as the Gateway can manually trigger re-fetching the federated schemas programmatically by calling the `application.graphql.gateway.refresh()` method. The method either returns the newly generated schema or `null` if no changes have been discovered.

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const server = Fastify()

server.register(mercurius, {
  graphiql: true,
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:3000/graphql'
      },
      {
        name: 'company',
        url: 'http://localhost:3001/graphql'
      }
    ]
  }
})

server.listen(3002)

setTimeout(async () => {
  const schema = await server.graphql.gateway.refresh()

  if (schema !== null) {
    server.graphql.replaceSchema(schema)
  }
}, 10000)
```

#### Using Gateway mode with a schema registry

The service acting as the Gateway can use supplied schema definitions instead of relying on the gateway to query each service. These can be updated using `application.graphql.gateway.serviceMap.serviceName.setSchema()` and then refreshing and replacing the schema.

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const server = Fastify()

server.register(mercurius, {
  graphiql: true,
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:3000/graphql',
        schema: `
          extend type Query {
            me: User
          }

          type User @key(fields: "id") {
            id: ID!
            name: String
          }
        `
      },
      {
        name: 'company',
        url: 'http://localhost:3001/graphql',
        schema: `
          extend type Query {
            company: Company
          }

          type Company @key(fields: "id") {
            id: ID!
            name: String
          }
        `
      }
    ]
  }
})

await server.listen(3002)

server.graphql.gateway.serviceMap.user.setSchema(`
  extend type Query {
    me: User
  }

  type User @key(fields: "id") {
    id: ID!
    name: String
    username: String
  }
`)

const schema = await server.graphql.gateway.refresh()

if (schema !== null) {
  server.graphql.replaceSchema(schema)
}
```

#### Flag service as mandatory in Gateway mode

Gateway service can handle federated services in 2 different modes, `mandatory` or not by utilizing the `gateway.services.mandatory` configuration flag. If a service is not mandatory, creating the federated schema will succeed even if the service isn't capable of delivering a schema. By default, services are not mandatory. Note: At least 1 service is necessary to create a valid federated schema.

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const server = Fastify()

server.register(mercurius, {
  graphiql: true,
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:3000/graphql',
        mandatory: true
      },
      {
        name: 'company',
        url: 'http://localhost:3001/graphql'
      }
    ]
  },
  pollingInterval: 2000
})

server.listen(3002)
```

#### Using a custom errorHandler for handling downstream service errors in Gateway mode

Service which uses Gateway mode can process different types of issues that can be obtained from remote services (for example, Network Error, Downstream Error, etc.). A developer can provide a function (`gateway.errorHandler`) that can process these errors.

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const server = Fastify()

server.register(mercurius, {
  graphiql: true,
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:3000/graphql',
        mandatory: true
      },
      {
        name: 'company',
        url: 'http://localhost:3001/graphql'
      }
    ],
    errorHandler: (error, service) => {
      if (service.mandatory) {
        server.log.error(error)
      }
    },
  },
  pollingInterval: 2000
})

server.listen(3002)
```

_Note: The default behavior of `errorHandler` is call `errorFormatter` to send the result. When is provided an `errorHandler` make sure to **call `errorFormatter` manually if needed**._
