# TypeScript usage

> Complete example are available in [https://github.com/mercurius-js/mercurius-typescript](https://github.com/mercurius-js/mercurius-typescript).

Mercurius has included type definitions, that you can use in your projects manually if you wish, but you can also use [mercurius-codegen](https://github.com/mercurius-js/mercurius-typescript/tree/master/packages/mercurius-codegen), which is designed to improve the TypeScript experience using [GraphQL Code Generator](https://graphql-code-generator.com/) seamlessly while you code, but this documentation will show you how to use both.

## Codegen

Install [mercurius-codegen](https://github.com/mercurius-js/mercurius-typescript/tree/master/packages/mercurius-codegen):

```bash
npm install mercurius-codegen
# or your preferred package manager
```

Then in your code

```ts
import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import mercurius, { IResolvers } from 'mercurius'
import mercuriusCodegen, { gql } from 'mercurius-codegen'

const app = Fastify()

const buildContext = async (req: FastifyRequest, _reply: FastifyReply) => {
  return {
    authorization: req.headers.authorization
  }
}

type PromiseType<T> = T extends PromiseLike<infer U> ? U : T

declare module 'mercurius' {
  interface MercuriusContext extends PromiseType<ReturnType<typeof buildContext>> {}
}

// Using the fake "gql" from mercurius-codegen gives tooling support for
// "prettier formatting" and "IDE syntax highlighting".
// It's optional
const schema = gql`
  type Query {
    hello(name: String!): String!
  }
`

const resolvers: IResolvers = {
  Query: {
    hello(root, { name }, ctx, info) {
      // root ~ {}
      // name ~ string
      // ctx.authorization ~ string | undefined
      // info ~ GraphQLResolveInfo
      return 'hello ' + name
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  context: buildContext
})

mercuriusCodegen(app, {
  // Commonly relative to your root package.json
  targetPath: './src/graphql/generated.ts'
}).catch(console.error)
```

Then automatically while you code the types are going to be generated and give you type-safety and auto-completion.

You can check the more detailed documentation [here](https://github.com/mercurius-js/mercurius-typescript/tree/master/packages/mercurius-codegen) and two complete examples using GraphQL Operations, [Loaders](/docs/loaders.md), [Subscriptions](/docs/subscriptions.md), and [Full integration testing](/docs/integrations/mercurius-integration-testing.md) in [mercurius-typescript/examples/codegen](https://github.com/mercurius-js/mercurius-typescript/tree/master/examples/codegen), and an even further example that uses `.gql` files to make your GraphQL Schema in [**mercurius-typescript/examples/codegen-gql-files**](https://github.com/mercurius-js/mercurius-typescript/tree/master/examples/codegen-gql-files).

## Manually typing

You can also use the included types with mercurius in your API

```ts
import Fastify, { FastifyReply, FastifyRequest } from 'fastify'
import mercurius, {
  IFieldResolver,
  IResolvers,
  MercuriusContext,
  MercuriusLoaders
} from 'mercurius'

export const app = Fastify()

const buildContext = async (req: FastifyRequest, _reply: FastifyReply) => {
  return {
    authorization: req.headers.authorization
  }
}

type PromiseType<T> = T extends PromiseLike<infer U> ? U : T

declare module 'mercurius' {
  interface MercuriusContext extends PromiseType<ReturnType<typeof buildContext>> {}
}

const schema = `
type Query {
  helloTyped: String!
  helloInline: String!
}
`

const helloTyped: IFieldResolver<
  {} /** Root */,
  MercuriusContext /** Context */,
  {} /** Args */
> = (root, args, ctx, info) => {
  // root ~ {}
  root
  // args ~ {}
  args
  // ctx.authorization ~ string | undefined
  ctx.authorization
  // info ~ GraphQLResolveInfo
  info

  return 'world'
}

const resolvers: IResolvers = {
  Query: {
    helloTyped,
    helloInline: (root: {}, args: {}, ctx, info) => {
      // root ~ {}
      root
      // args ~ {}
      args
      // ctx.authorization ~ string | undefined
      ctx.authorization
      // info ~ GraphQLResolveInfo
      info

      return 'world'
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  context: buildContext
})
```

You can check [**mercurius-typescript/examples/manual**](https://github.com/mercurius-js/mercurius-typescript/tree/master/examples/manual) for more detailed usage, using [Loaders](/docs/loaders.md), [Subscriptions](/docs/subscriptions.md) and [Full integration testing](/docs/integrations/mercurius-integration-testing.md)
