# Integrating GQLoom with Mercurius

You can easily use [GQLoom](https://gqloom.dev/) in combination with Mercurius.  
GQLoom is an ergonomic **code-first** GraphQL Schema Loom that weaves **runtime types** from the **TypeScript/JavaScript** ecosystem into GraphQL Schema. It supports various runtime type sources such as [Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [Prisma](https://www.prisma.io/), [MikroORM](https://mikro-orm.io/), and [Drizzle](https://orm.drizzle.team/), allowing you to build type-safe GraphQL APIs using your familiar validation and ORM libraries.

## Installation

GQLoom supports multiple runtime type libraries. Choose the one that fits your needs:

**Using Zod:**
```bash
# use npm
npm i @gqloom/core @gqloom/zod zod graphql fastify mercurius

# use pnpm
pnpm add @gqloom/core @gqloom/zod zod graphql fastify mercurius

# use yarn
yarn add @gqloom/core @gqloom/zod zod graphql fastify mercurius
```

**Using Valibot:**
```bash
# use npm
npm i @gqloom/core @gqloom/valibot valibot graphql fastify mercurius

# use pnpm
pnpm add @gqloom/core @gqloom/valibot valibot graphql fastify mercurius

# use yarn
yarn add @gqloom/core @gqloom/valibot valibot graphql fastify mercurius
```

## Quick Start

Here's a simple example to get you started. The main difference between Zod and Valibot is the import and weaver you use:

**With Zod:**
```ts
// schema.ts
import { resolver, query, weave } from "@gqloom/core"
import { ZodWeaver } from "@gqloom/zod"
import * as z from "zod"

export const helloResolver = resolver({
  hello: query(z.string())
    .input({
      name: z
        .string()
        .nullish()
        .transform((value) => value ?? "World"),
    })
    .resolve(({ name }) => `Hello, ${name}!`),
})

export const schema = weave(ZodWeaver, helloResolver)
```

**With Valibot:**
```ts
// schema.ts
import { resolver, query, weave } from "@gqloom/core"
import { ValibotWeaver } from "@gqloom/valibot"
import * as v from "valibot"

export const helloResolver = resolver({
  hello: query(v.string())
    .input({ name: v.nullish(v.string(), "World") })
    .resolve(({ name }) => `Hello, ${name}!`),
})

export const schema = weave(ValibotWeaver, helloResolver)
```

Then, link the schema to Mercurius:

```ts
// index.ts
import Fastify from "fastify"
import mercurius from "mercurius"
import { schema } from "./resolvers"

const app = Fastify()

app.register(mercurius, {
  schema,
  graphiql: true,
})

app.listen({ port: 3000 }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server listening at ${address}`)
})
```

Run your server:

```bash
ts-node index.ts
```

## Working with Objects and Mutations

You can define object types and mutations using your chosen runtime validation library.

**With Zod:**
```ts
// schema.ts
import * as z from "zod"

export const Cat = z.object({
  __typename: z.literal("Cat").nullish(),
  name: z.string(),
  age: z.int(),
  loveFish: z.boolean().nullish(),
})
```

```ts
// schema.ts
import { resolver, query, mutation, weave } from "@gqloom/core"
import { ZodWeaver } from "@gqloom/zod"
import * as z from "zod"
import { Cat } from "./schema"

export const catResolver = resolver({
  cat: query(Cat.nullable())
    .input({ id: z.number() })
    .resolve(({ id }) => {
      // Your data fetching logic here
      return {
        name: "Fluffy",
        age: 3,
        loveFish: true,
      }
    }),

  createCat: mutation(Cat)
    .input({ data: Cat})
    .resolve(({ data }) => {
    // Your mutation logic here
    return data
  }),
})

export const schema = weave(ZodWeaver, catResolver)
```

**With Valibot:**
```ts
// schema.ts
import * as v from "valibot"

export const Cat = v.object({
  __typename: v.nullish(v.literal("Cat")),
  name: v.string(),
  age: v.pipe(v.number(), v.integer()),
  loveFish: v.nullish(v.boolean()),
})
```

```ts
// schema.ts
import { resolver, query, mutation, weave } from "@gqloom/core"
import { ValibotWeaver } from "@gqloom/valibot"
import * as v from "valibot"
import { Cat } from "./schema"

export const catResolver = resolver({
  cat: query(Cat.nullable())
    .input({ id: v.pipe(v.number(), v.integer()) })
    .resolve(({ id }) => {
      // Your data fetching logic here
      return {
        name: "Fluffy",
        age: 3,
        loveFish: true,
      }
    }),

  createCat: mutation(Cat)
    .input({ data: Cat })
    .resolve(({ data }) => {
    // Your mutation logic here
    return data
  }),
})

export const schema = weave(ValibotWeaver, catResolver)
```

## Accessing Context

When using GQLoom with Mercurius, you can access the Mercurius context in your resolvers using the [useContext](https://gqloom.dev/docs/context.html) hook.

First, create a helper function to access context:

```ts
// context.ts
import { useContext } from "@gqloom/core/context"
import type { MercuriusContext } from "mercurius"

export function useAuthorization() {
  return useContext<MercuriusContext>().reply.request.headers.authorization
}
```

Then use it in your resolvers:

```ts
// schema.ts
import { resolver, query, weave } from "@gqloom/core"
import { ZodWeaver } from "@gqloom/zod"
import * as z from "zod"
import { useAuthorization } from "./context"

export const authResolver = resolver({
  me: query(z.string())
    .resolve(() => {
      const authHeader = useAuthorization()
      return `Authorized with: ${authHeader}`
    }),
})

export const schema = weave(ZodWeaver, authResolver)
```

For more information about context in Mercurius, see the [Context documentation](/docs/context.md).

## Learn More

- [GQLoom Documentation](https://gqloom.dev/)
- [Zod Documentation](https://zod.dev/)
- [Valibot Documentation](https://valibot.dev/)
- [Mercurius Context Documentation](/docs/context.md)
