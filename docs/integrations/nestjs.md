# NestJS Integration

NestJS offers Fastify and Mercurius support out of the box. It also supports both schema and code-first approaches to development. We'll be covering the code-first approach, as it is used more commonly.

> **Note**: Support for NestJS can be found at their [Discord server](https://discord.com/invite/G7Qnnhy). 

## Installation

To get going, follow the [first steps](https://docs.nestjs.com/first-steps) to install the Nest CLI and to create your Nest API project with the CLI. 

Use whatever project name you'd like in the second command below:

```bash
npm i -g @nestjs/cli
nest new my-new-project
```

You'll be asked which package manager you'd like to use. Select the one you want and the CLI will install your initialized app with it. 

## Fastify, Mercurius and GraphQL Setup
In order to work with Fastify, you'll need to change NestJS' "platform" to Fastify, since NestJS works with Express as the default. To do so, follow these steps:

Remove the dependency for Express:

```js
npm remove @nestjs/platform-express
``` 

Then install the NestJS Fastify platform package. Also install webpack. Webpack is needed as a dev dependency for the dev server with Fastify: 

```bash
npm i --save @nestjs/platform-fastify 
npm i --dev webpack
```
> **Note**: Make sure to use the same package manager you selected in your project initialization.

Next, [install the Nest GraphQL and Mercurius modules and the other needed dependencies](https://docs.nestjs.com/graphql/quick-start). 


```bash
npm i @nestjs/graphql @nestjs/mercurius graphql mercurius
```
> **Note**: Again, make sure to use the same package manager you selected in your project initialization.

To use the GraphQL module, replace your AppModule file with the following code:

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';
import { RecipesModule } from './recipes/recipes.module';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      graphiql: true,
      autoSchemaFile: true,
    }),
    RecipesModule,
  ],
})
export class AppModule {}

```
The `forRoot` method of the `GraphQLModule` requires a config object as an argument. This object will be passed on to Mercurius for its configuration. The only extra option is the `driver` property, which tells Nest to use Nest's Mercurius driver. 

> **Note**: you can safely remove the `app.controller` and `app.controller.spec` files in the `/src` folder. They aren't needed.

## Getting Started with Development
Now you can start creating GraphQL Modules with Resolvers. Lets create a `recipes` module. In the root folder, run this CLI command:

```bash
nest generate module recipes
```
You'll notice the module import is added to the `AppModule` automatically and you should see something like below added your your project under a newly created `recipes` folder:

```ts
// recipes.modules.ts
import { Module } from '@nestjs/common';

@Module({})
export class RecipesModule {}
```
This is your first module. Yay!

Now lets create a schema file for our `recipes` GraphQL output object. Create a new file called `recipe.model.ts` in the `/recipes` folder with the following code:

```ts
// recipe.model.ts
import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'recipe ' })
export class Recipe {
  @Field(type => ID)
  id: string;

  @Directive('@upper')
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  creationDate: Date;

  @Field(type => [String])
  ingredients: string[];
}
```

Let's generate a recipes resolver class too. Make sure you are back in your root folder and run this command:

```bash
nest generate resolver recipes
```

This command creates the `recipes.resolver.ts` and `recipes.resolver.spec.ts` files. It should also add the resolver file as a provider in your `recipes` module automatically. [Providers](https://docs.nestjs.com/providers) are a powerful part of Nest's [dependency injection](https://docs.nestjs.com/fundamentals/custom-providers) system. 

Now you can alter the `recipe.resolver.ts` file and add the code below to define your resolver methods:

```ts
// recipe.resolver.ts
import { NotFoundException } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RecipesArgs } from './recipe.args';
import { Recipe } from './recipe.model';
import { RecipesService } from './recipes.service';

@Resolver((of) => Recipe)
export class RecipesResolver {
  constructor(private readonly recipesService: RecipesService) {}

  @Query((returns) => Recipe)
  async recipe(@Args('id') id: string): Promise<Recipe> {
    const recipe = await this.recipesService.findOneById(id);
    if (!recipe) {
      throw new NotFoundException(id);
    }
    return recipe;
  }

  @Query((returns) => [Recipe])
  recipes(@Args() recipesArgs: RecipesArgs): Promise<Recipe[]> {
    return this.recipesService.findAll(recipesArgs);
  }

  @Mutation((returns) => Recipe)
  async addRecipe(): /* @Args('newRecipeData') newRecipeData: NewRecipeInput,*/
  Promise<Recipe> {
    const recipe = await this.recipesService.create(/* newRecipeData */);
    return recipe;
  }

  @Mutation((returns) => Boolean)
  async removeRecipe(@Args('id') id: string) {
    return this.recipesService.remove(id);
  }
}
```

Lastly, you'll need to create a `recipes.service.ts` file for your Recipes Service. Services are the classes which the resolver will call for the "business logic" of your resolvers, and in the end, your application. The service we are creating will also use the output object we created earlier:

```ts
// recipes.service.ts
import { Injectable } from '@nestjs/common';
import { NewRecipeInput } from './dto/new-recipe.input';
import { RecipesArgs } from './dto/recipes.args';
import { Recipe } from './models/recipe.model';

@Injectable()
export class RecipesService {
  /**
   * Note, this is just a MOCK
   * Put some real business logic here
   * Only for demonstration purposes
   */

  async create(data: NewRecipeInput): Promise<Recipe> {
    return {} as any;
  }

  async findOneById(id: string): Promise<Recipe> {
    return {} as any;
  }

  async findAll(recipesArgs: RecipesArgs): Promise<Recipe[]> {
    return [] as Recipe[];
  }

  async remove(id: string): Promise<boolean> {
    return true;
  }
}
```

To run the dev server and get going with more programming, run this command:

```bash
`npm run start:dev`
```

If all went well, you should see something like this from the dev server's compilation process:

```bash
[Nest] 61751  - 04/10/2022, 1:36:21 PM     LOG [NestFactory] Starting Nest application...
[Nest] 61751  - 04/10/2022, 1:36:21 PM     LOG [InstanceLoader] AppModule dependencies initialized +30ms
[Nest] 61751  - 04/10/2022, 1:36:21 PM     LOG [InstanceLoader] RecipesModule dependencies initialized +1ms
[Nest] 61751  - 04/10/2022, 1:36:21 PM     LOG [InstanceLoader] GraphQLSchemaBuilderModule dependencies initialized +0ms
[Nest] 61751  - 04/10/2022, 1:36:21 PM     LOG [InstanceLoader] GraphQLModule dependencies initialized +0ms
[Nest] 61751  - 04/10/2022, 1:36:21 PM     LOG [GraphQLModule] Mapped {/graphql, POST} route +42ms
[Nest] 61751  - 04/10/2022, 1:36:21 PM     LOG [NestApplication] Nest application successfully started +1ms

```

And you should be able to see GraphiQL under `http://localhost:3000/graphiql`.

Now you can continue adding more modules, models, resolvers and business logic in services.

## Summary

This is just a short and rough example of how to get going with NestJS and Mercurius. There is a lot more to do and learn to get a fully running GraphQL API going. The code examples above, despite lacking some explanation, do show the potential of NestJS with Mecurius. Again, we've only barely scratched the surface. 

If you'd like to continue with Nest and Mercurius and learn more about Nest, please do read the [documention on the NestJS website](https://docs.nestjs.com/). The two make a really great combination in terms of developer experience.

Should you need any help with Nest, they have a [great support community](https://discord.com/invite/G7Qnnhy). Please go there for support with NestJS questions or issues. 


