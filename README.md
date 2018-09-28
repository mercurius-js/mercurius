# fastify-gql

Fastify barebone GraphQL adapter

## Example

```js
'use strict'

const Fastify = require('fastify')
const GQL = require('.')

const app = Fastify()

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async ({ x, y }) => x + y
  }
};

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

## License

MIT
