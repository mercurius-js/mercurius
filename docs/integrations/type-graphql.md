# Integrating TypeGraphQL with Mercurius

You can easily use [TypeGraphQL](https://github.com/MichalLytek/type-graphql) in combination with Mercurius.
This allows you to follow a code first approach instead of the SDL first.

## Installation

```bash
npm install --save type-graphql graphql reflect-metadata
```

Now you can define a schema using classes and decorators:

```ts
// recipe.ts
import { Field, ObjectType, Int, Float, Resolver, Query } from "type-graphql";

@ObjectType({ description: "Object representing cooking recipe" })
export class Recipe {
  @Field()
  title: string;

  @Field((type) => String, {
    nullable: true,
    deprecationReason: "Use `description` field instead",
  })
  get specification(): string | undefined {
    return this.description;
  }

  @Field({
    nullable: true,
    description: "The recipe description with preparation info",
  })
  description?: string;

  @Field((type) => [Int])
  ratings: number[];

  @Field()
  creationDate: Date;
}

@Resolver()
export class RecipeResolver {
  @Query((returns) => Recipe, { nullable: true })
  async recipe(@Arg("title") title: string): Promise<Recipe | undefined> {
    return {
      description: "Desc 1",
      title: "Recipe 1",
      ratings: [0, 3, 1],
      creationDate: new Date("2018-04-11"),
    };
  }
}
```

This can be linked to the Mercurius plugin:

```ts
// index.ts
import "reflect-metadata";
import fastify from "fastify";
import mercurius from "mercurius";

import { RecipeResolver } from "./recipe";

async function main() {
  // build TypeGraphQL executable schema
  const schema = await buildSchema({
    resolvers: [RecipeResolver],
  });

  const app = fastify();

  app.register(mercurius, {
    schema,
    graphiql: "playground",
  });

  app.get("/", async (req, reply) => {
    const query = "{ add(x: 2, y: 2) }";
    return reply.graphql(query);
  });

  app.listen(3000);
}

main().catch(console.error);
```

If you run this, you will get a GraphQL API based on your code:

```bash
ts-node index.ts
```
