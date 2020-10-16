# mercurius

## Batched Queries

Batched queries, like those sent by `apollo-link-batch-http` are supported by enabling the `allowBatchedQueries` option.

Instead a single query object, an array of queries is accepted, and the response is returned as an array of results. Errors are returned on a per query basis. Note that the response will not be returned until the slowest query has been executed.

Request:

```js
[
  {
    operationName: "AddQuery",
    variables: { x: 1, y: 2 },
    query: "query AddQuery ($x: Int!, $y: Int!) { add(x: $x, y: $y) }",
  },
  {
    operationName: "DoubleQuery",
    variables: { x: 1 },
    query: "query DoubleQuery ($x: Int!) { add(x: $x, y: $x) }",
  },
  {
    operationName: "BadQuery",
    query: "query DoubleQuery ($x: Int!) {---", // Malformed Query
  },
];
```

Response:

```js
[
  {
    data: { add: 3 },
  },
  {
    data: { add: 2 },
  },
  {
    errors: [{ message: "Bad Request" }],
  },
];
```
