# mercurius

## Loaders

A loader is an utility to avoid the 1 + N query problem of GraphQL.
Each defined loader will register a resolver that coalesces each of the
request and combines them into a single, bulk query. Moreover, it can
also cache the results, so that other parts of the GraphQL do not have
to fetch the same data.

Each loader function has the signature `loader(queries, context)`.
`queries` is an array of objects defined as `{ obj, params, info }` where
`obj` is the current object, `params` are the GraphQL params (those
are the first two parameters of a normal resolver) and `info` contains
additional information about the query and execution. `info` object is
only available in the loader if the cache is set to `false`. The `context`
is the GraphQL context, and it includes a `reply` object.

Example:

```js
const loaders = {
  Dog: {
    async owner (queries, { reply }) {
      return queries.map(({ obj, params }) => owners[obj.name])
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
      async loader (queries, { reply }) {
        return queries.map(({ obj, params, info }) => { 
          // info is available only if the loader is not cached
          owners[obj.name]
        })
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

Alternatively, globally disabling caching also disable the Loader cache:

```js
const loaders = {
  Dog: {
    async owner (queries, { reply }) {
      return queries.map(({ obj, params, info }) => { 
        // info is available only if the loader is not cached
        owners[obj.name]
      })
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  loaders,
  cache: false
})
```

Disabling caching has the advantage to avoid the serialization at
the cost of more objects to fetch in the resolvers.

Internally, it uses
[single-user-cache](http://npm.im/single-user-cache).
