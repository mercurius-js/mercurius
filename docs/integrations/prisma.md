# Integrating Prisma with Mercurius

[Prisma](https://prisma.io) is an [open-source](https://github.com/prisma/prisma) ORM for Node.js and TypeScript. 
It can be used as an _alternative_ to writing plain SQL, or using another database access tool such as SQL query builders (e.g. [knex.js](https://knexjs.org/)) or ORMs (like [TypeORM](https://typeorm.io/) and [Sequelize](https://sequelize.org/)).
Prisma currently supports PostgreSQL, MySQL, SQL Server and SQLite.

You can easily combine Prisma and Mercurius to build your GraphQL server that connects to a database. Prisma is agnostic to the GraphQL tools you use when building your GraphQL server. 

Prisma can be used with plain JavaScript and it embraces TypeScript and provides a level to type-safety that goes beyond the guarantees other ORMs in the TypeScript ecosystem. You can find an in-depth comparison of Prisma against other ORMs [here](https://www.prisma.io/docs/concepts/more/comparisons)

## Installation

Install [Prisma CLI](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-cli) as a development dependency in your project:

```bash
npm install prisma@2.20.1 --save-dev
npm install @prisma/client@2.20.1
```

[Prisma Client](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference) is an auto-generated database client that allows you to interact with your database in a type-safe way.

> **Note**: Prisma releases typically happen every two weeks with a minor version update.

Initialize Prisma in your project:  
```bash
npx prisma init
```

This command does the following:
- Creates a new directory called `prisma` which contains a file called `schema.prisma`. This file defines your database connection and the Prisma Client generator.
- Creates a `.env` file at the root of your project. This defines your environment variables (used for your database connection).

## Connect to your database

To connect to your database, set the `url` field of the `datasource` block in your Prisma schema to your database connection URL. By default, it's set to `postgresql` but this guide will use SQLite database. Adjust your `datasource` block to `sqlite` and `url` to `file:./dev.db`:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}
```

If you wish to use a different database, you can jump to [switching database providers](#switching-database-providers).
## Create database tables with Prisma Migrate

Add the following model to your `prisma.schema` file:

```prisma
model Post {
  id        Int     @id @default(autoincrement())
  title     String
  body      String
  published Boolean
}
```

To map your data model to the database schema, you need to use `prisma migrate` CLI commands:

```bash
npx prisma migrate dev --name init
```

The above command does three things:
1. Creates a new SQL migration file for this migration
1. Runs the SQL migration against the database
1. Generates Prisma Client

## Set up your GraphQL server

```js
// index.js
'use strict'
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { PrismaClient } = require('@prisma/client')

const app = Fastify()
const prisma = new PrismaClient()

const schema = `
type Mutation {
  createDraft(body: String!, title: String!): Post
  publish(draftId: Int!): Post
}

type Post {
  body: String
  id: Int
  published: Boolean
  title: String
}

type Query {
  drafts: [Post]
  posts: [Post]
}
`

const resolvers = {
  Query: {
    posts: async (_parent, args, ctx) => {
      return ctx.prisma.post.findMany({
        where: {
          published: true
        }
      })
    },
    drafts: async (_parent, args, ctx) => {
      return ctx.prisma.post.findMany({
        where: {
          published: false
        }
      })
    },
  },
  Mutation: {
    createDraft: async (_parent, args, ctx) => {
      return ctx.prisma.post.create({
        data: {
          title: args.title,
          body: args.body,
        }
      })
    },
    publish: async (_parent, args, ctx) => {
      return ctx.prisma.post.update({
        where: { id: args.draftId },
        data: { published: true }
      })
    },
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  context: (request, reply) => {
    return { prisma }
  },
  graphiql: true
})

app.listen(3000)
  .then(() => console.log(`🚀 Server ready at http://localhost:3000/graphiql`))

```

Start your application:
```bash
node index.js
```

## Switching database providers

If you want to switch to a different database other than SQLite, you can adjust the database connection in `prisma/prisma.schema` by reconfiguring the `datasource` block.

Learn more about the different connection configurations in the [docs](https://www.prisma.io/docs/reference/database-reference/connection-urls).

Here's an overview of an example configuration with different databases:
### PostgreSQL

For PostgreSQL, the connection URL has the following structure:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Here is an example connection string with a local PostgreSQL database:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### MySQL

For MySQL, the connection URL has the following structure:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

Here is an example connection string with a local MySQL database:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

### SQLServer (preview)

Here is an example connection string with a local Microsoft SQL Server database:

```prisma
datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}
```

Because SQL Server is currently in [Preview](https://www.prisma.io/docs/about/releases#preview), you need to specify the `previewFeatures` on your `generator` block:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["microsoftSqlServer"]
}
```
