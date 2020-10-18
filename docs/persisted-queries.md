# mercurius

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

This default is compatible with `apollo-client`, and requires no additional tooling to set up at the cost of some performance. In order for this mode to be effective, you must have long lived server instances (i.e _not_ cloud functions). This mode is also appropriate for public APIs where queries are not known ahead of time.

When an unrecognised hash is recieved by the server instance, an error is thrown informing the client that the persisted query has not been seen before. The client then re-sends the full query string. When a full query string is recieved, the server caches the hash of the query string and returns the response. _Note that sticky sessions should be used to ensure optimal performance here by making sure the follow up request is sent to the same server instance._

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

This would enable all persisted queries to be shared between all server instances in a cache which is dynamically populated. The lookup time from the cache is an additional overhead for each request, but a higher rate of persisted query matches would be achieved. This may be beneficial, for example, in a public facing API which supports persisted queries and uses cloud functions (short lived server instances). _Note the performance impacts of this need to be considered thoroughly: the latency added to each request must be less than the savings from smaller requests._

A example of using this with Redis would be:

```js
const mercurius = require('mercurius')

const persistedQueryProvider = {
  ...mercurius.persistedQueryDefaults.automatic(),
  getQueryFromHash: async (hash) => redis.get(hash),
  saveQuery: async (hash, query) => redis.set(hash, query)
}

app.register(mercurius, {
  ...persistedQueryProvider
})
```
