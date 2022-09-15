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
import { Arg, Field, ObjectType, Int, Float, Resolver, Query } from "type-graphql";

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
  async recipe(@Arg("title") title: string): Promise<Omit<Recipe, 'specification'> | undefined> {
    return {
      description: "Desc 1",
      title: title,
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
import fastify, {FastifyRegisterOptions} from "fastify";
import mercurius, {MercuriusOptions} from "mercurius";
import { buildSchema } from 'type-graphql'

import { RecipeResolver } from "./recipe";

async function main() {
  // build TypeGraphQL executable schema
  const schema = await buildSchema({
    resolvers: [RecipeResolver],
  });

  const app = fastify();

  const opts: FastifyRegisterOptions<MercuriusOptions> = {
    schema,
    graphiql: true
  }
  app.register(mercurius, opts);

  app.get("/", async (req, reply) => {
    const query = `{ 
      recipe(title: "Recipe 1") {
        title
        description
        ratings
        creationDate
      }
    }`;
    return reply.graphql(query);
  });

  app.listen({ port: 3000 });
}

main().catch(console.error);
```

If you run this, you will get a GraphQL API based on your code:

```bash
ts-node index.ts
```

## Class validators

One of the features of `type-graphql` is ability to add validation rules using decorators. Let's say we want to add
a mutation with some simple validation rules for its input. First we need to define the class for the input:

```ts
@InputType()
export class RecipeInput {
    @Field()
    @MaxLength(30)
    title: string;

    @Field({ nullable: true })
    @Length(30, 255)
    description?: string;
}
```

Then add a method in the `RecipeResolver` that would serve as a mutation implementation:

```ts
@Mutation(returns => Recipe)
async addRecipe(@Arg("input") recipeInput: RecipeInput): Promise<Recipe> {
    const recipe = new Recipe();
    recipe.description = recipeInput.description;
    recipe.title = recipeInput.title;
    recipe.creationDate = new Date();
    return recipe;
}
```

Now, here we can run into a problem. Getting the details of validation errors can get confusing. Normally, the default 
error formatter of `mercurius` will handle the error, log them and carry over the details to the response of API call.
The problem is that validation errors coming from `type-graphql` are stored in `originalError` field (in contrast to
the `extensions` field, which was designed to be carrying such data) of `GraphQLError` object, which is a non-enumerable
property (meaning it won't get serialized/logged). 

An easy workaround would be to copy the validation details from `originalError` to `extensions` field using custom error
formatter. The problem is that in GraphQLError's constructor method, if the extensions are empty initially, then this
field is being marked as a non-enumerable as well. To work this problem around you could do something like this:

```ts
const app = fastify({ logger: { level: 'info' } });
const opts: FastifyRegisterOptions<MercuriusOptions> = {
    schema,
    graphiql: true,
    errorFormatter: (executionResult, context) => {
        const log = context.reply ? context.reply.log : context.app.log;
        const errors = executionResult.errors.map((error) => {
            error.extensions.exception = error.originalError;
            Object.defineProperty(error, 'extensions', {enumerable: true});
            return error;
        });
        log.info({ err: executionResult.errors }, 'Argument Validation Error');
        return {
            statusCode: 201,
            response: {
                data: executionResult.data,
                errors
            }
        }
    }
}
app.register(mercurius, opts);
```