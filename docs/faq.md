# FAQ

This page answers commonly asked questions about Mercurius.

## Disable Graphql introspection
To disable Graphql introspection you can use `NoSchemaIntrospectionCustomRule` from graphql. We have an example on "example/disable-instrospection.js", using this approach:

```js
import { NoSchemaIntrospectionCustomRule } from 'graphql';

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`
const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

app.register(mercurius, {
  context: buildContext,
  schema,
  resolvers,
  validationRules: process.env.NODE_ENV === 'production' && [NoSchemaIntrospectionCustomRule],
});
```

## Execute against different schemas based on request headers

Sometimes we may face the need to present a scheme that varies depending on specific situations.
To accomplish this need we can use one powerful fastify/find-my-way feature called **Custom Constraints**.

https://www.fastify.io/docs/latest/Reference/Routes/#asynchronous-custom-constraints

> Fastify supports constraining routes to match only certain requests based on some property of the request, like the Host header, or any other value via find-my-way constraints.

We can then create two mercurius instances that expose the two different schemas and use the constraint on the header to drive the request to one or other mercurius instance.

### 1. Create the constraint and initialize the fastify instance
```js
const Fastify = require('fastify')
const mercurius = require('..')

// Define the constraint custom strategy
const schemaStrategy = {
  name: 'schema',
  storage: function () {
    const handlers = {}
    return {
      get: (type) => { return handlers[type] || null },
      set: (type, store) => { handlers[type] = store }
    }
  },
  deriveConstraint: (req, ctx) => {
    return req.headers.schema
  },
  validate: () => true,
  mustMatchWhenDerived: true
}

// Initialize fastify
const app = Fastify({ constraints: { schema: schemaStrategy } })
```
### 2. Initialize the first mercurius instance and bind it to the `/` route only if the `schema` header value is equal to `A`

```js
const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

// Schema A registration with A constraint
app.register(async childServer => {
  childServer.register(mercurius, {
    schema,
    resolvers,
    graphiql: false,
    routes: false
  })

  childServer.route({
    path: '/',
    method: 'POST',
    constraints: { schema: 'A' },
    handler: (req, reply) => {
      const query = req.body
      return reply.graphql(query)
    }
  })
})
```
### 3. Initialize the second mercurius instance and bind it to the `/` route only if the `schema` header value is equal to `B`

```js
const schema2 = `
  type Query {
    subtract(x: Int, y: Int): Int
  }
`

const resolvers2 = {
  Query: {
    subtract: async (_, obj) => {
      const { x, y } = obj
      return x - y
    }
  }
}

app.register(async childServer => {
  childServer.register(mercurius, {
    schema: schema2,
    resolvers: resolvers2,
    graphiql: false,
    routes: false
  })

  childServer.route({
    path: '/',
    method: 'POST',
    constraints: { schema: 'B' },
    handler: (req, reply) => {
      const query = req.body
      return reply.graphql(query)
    }
  })
})
```

4. Start the fastify server

```js
app.listen({ port: 3000 })
```

### Important notes:

In order to use graphql in constrained routes we need to set mercurius `routes` parameter to `false` in order to avoid that both the mercurius instances try to expose themself at `/graphql`.
