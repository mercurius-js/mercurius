'use strict'

const Fastify = require('fastify')
const GQL = require('../..')
const app = Fastify()
const sqlite = require('sqlite')

const dbPromise = sqlite.open('./database.sqlite', { promise: Promise })
  .then(db => db.migrate({ force: 'last' })).catch((err) => {
    console.log(err)
  })

const schema = `
  type Post {
    id: ID!
    title: String!
    subtitle: String
    content: String
    category: Category
  }

  type Category {
    id: ID!
    name: String!
  }

  type Query {
    posts(limit: Int): [Post]
  }
`

const resolvers = {
  Query: {
    posts: async (_, params, context, info) => {
      const queryData = context.buildQueryObject(info)
      const db = await dbPromise
      let posts
      let relation = 'category'

      if (queryData.hasRelation(relation)) {
        // Select with relation
        // Can cause SQL injection
        posts = await db.all(
          `SELECT  ${queryData.getRootFields()}, ${queryData.getRelationFields(relation)} 
          FROM Post INNER JOIN Category ON Category.id = Post.categoryId`)
        // Transform from flatten structure to graph
        posts = queryData.expandToGraph(posts, [relation])
      } else {
        // Can cause SQL injection
        posts = await db.all(`SELECT ${queryData.getRootFields()} FROM Post`)
      }
      return posts
    }
  }
}

app.register(GQL, {
  schema,
  resolvers,
  graphiql: true,
  queryFilters: true
})

app.listen(3000)
