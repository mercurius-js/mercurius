# mercurius

## Context

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
