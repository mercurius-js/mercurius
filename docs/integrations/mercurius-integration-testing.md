# Testing

You can easily test your GraphQL API using `mercurius-integration-testing`.

[More info here.](https://github.com/mercurius-js/mercurius-integration-testing)

## Installation

```bash
npm install mercurius-integration-testing
```

## Usage

> Example using [node-tap](https://node-tap.org/)

```js
// server.js
const Fastify = require('fastify')
const mercurius = require('mercurius')

const app = Fastify()

const schema = `
type Query {
    hello: String!
}
`

const resolvers = {
  Query: {
    hello: () => {
      return 'world'
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  // Only required to use .batchQueries()
  allowBatchedQueries: true
})

exports.app = app
```

Then in your tests

```js
// example.test.js

const tap = require('tap')
const { createMercuriusTestClient } = require('mercurius-integration-testing')
const { app } = require('./server.js')

tap.test('works', (t) => {
  t.plan(1)

  const client = createMercuriusTestClient(app)

  client
    .query(
      `query {
        hello
       }`
    )
    .then((response) => {
      t.equivalent(response, {
        data: {
          hello: 'world'
        }
      })
    })
})
```

---

🎉

```
$ npx tap

 PASS  example.test.js 1 OK 129.664ms


  🌈 SUMMARY RESULTS 🌈


Suites:   1 passed, 1 of 1 completed
Asserts:  1 passed, of 1
Time:     2s
-----------|----------|----------|----------|----------|-------------------|
File       |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s |
-----------|----------|----------|----------|----------|-------------------|
All files  |      100 |      100 |      100 |      100 |                   |
 server.js |      100 |      100 |      100 |      100 |                   |
-----------|----------|----------|----------|----------|-------------------|

```

## Docs

Please check [https://github.com/mercurius-js/mercurius-integration-testing#api](https://github.com/mercurius-js/mercurius-integration-testing#api) for more documentation
