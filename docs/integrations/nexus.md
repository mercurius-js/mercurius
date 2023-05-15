# Integrating Nexus with Mercurius

You can easily use [Nexus](https://github.com/graphql-nexus/nexus) in combination with Mercurius.
This allows you to follow a code first approach instead of the SDL first.

## Installation

```bash
npm install --save nexus
```

Now you can define a schema.

```js
// schema.js
const { objectType, intArg, nonNull } = require("nexus");
const args = {
  x: nonNull(
    intArg({
      description: 'value of x',
    })
  ),
  y: nonNull(
    intArg({
      description: 'value of y',
    })
  ),
};
exports.Query = objectType({
  name: "Query",
  definition(t) {
    t.int("add", {
      resolve(_, { x, y }) {
        return x + y;
      },
      args,
    });
  },
});
```

This can be linked to the Mercurius plugin:

```js
// index.js

const Fastify = require("fastify");
const mercurius = require("mercurius");
const path = require("path");
const { makeSchema } = require("nexus");
const types = require("./schema");

const schema = makeSchema({
  types,
  outputs: {
    schema: path.join(__dirname, "./my-schema.graphql"),
    typegen: path.join(__dirname, "./my-generated-types.d.ts"),
  },
});

const app = Fastify();

app.register(mercurius, {
  schema,
  graphiql: true,
});

app.get("/", async function (req, reply) {
  const query = "{ add(x: 2, y: 2) }";
  return reply.graphql(query);
});

app.listen({ port: 3000 });
```

If you run this, you will get type definitions and a generated GraphQL based on your code:

```bash
node index.js
```
