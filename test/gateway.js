'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

async function createService (t, port, schema, resolvers = {}) {
  const service = Fastify()
  t.tearDown(() => service.close())
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true,
    graphiql: true
  })
  await service.listen(port)
}

// test('"schema" option not allowed in gateway moode', async (t) => {
//   const app = Fastify()
//   const schema = `
//     type Query {
//       add(x: Int, y: Int): Int
//     }
//   `

//   app.register(GQL, {
//     schema,
//     gateway: {
//       services: []
//     }
//   })

//   try {
//     await app.ready()
//   } catch (err) {
//     t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
//   }
// })

// test('"resolvers" option not allowed in gateway moode', async (t) => {
//   const app = Fastify()

//   app.register(GQL, {
//     resolvers: {},
//     gateway: {
//       services: []
//     }
//   })

//   try {
//     await app.ready()
//   } catch (err) {
//     t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
//   }
// })

// test('"loaders" option not allowed in gateway moode', async (t) => {
//   const app = Fastify()

//   app.register(GQL, {
//     loaders: {},
//     gateway: {
//       services: []
//     }
//   })

//   try {
//     await app.ready()
//   } catch (err) {
//     t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
//   }
// })

// test('"subscription" option not allowed in gateway moode', async (t) => {
//   const app = Fastify()

//   app.register(GQL, {
//     subscription: true,
//     gateway: {
//       services: []
//     }
//   })

//   try {
//     await app.ready()
//   } catch (err) {
//     t.is(err.message, 'Adding "schema", "resolvers", "loaders" or "subscription" to plugin options when plugin is running in gateway mode is not allowed')
//   }
// })

// test('calling defineLoaders throws an error in gateway mode', async (t) => {
//   await createService(t, 3001, `
//     extend type Query {
//       me: User
//     }

//     type User @key(fields: "id") {
//       id: ID!
//       name: String!
//     }
//   `)

//   const app = Fastify()
//   t.tearDown(() => app.close())

//   app.register(GQL, {
//     gateway: {
//       services: [{
//         name: 'service-1',
//         url: 'http://localhost:3001/graphql'
//       }]
//     }
//   })

//   await app.ready()

//   try {
//     app.graphql.defineLoaders({
//       Query: {
//         field () {}
//       }
//     })
//   } catch (err) {
//     t.is(err.message, 'Calling defineLoaders method is not allowed when plugin is running in gateway mode is not allowed')
//   }
// })

// test('calling defineResolvers throws an error in gateway mode', async (t) => {
//   await createService(t, 3001, `
//     extend type Query {
//       me: User
//     }

//     type User @key(fields: "id") {
//       id: ID!
//       name: String!
//     }
//   `)

//   const app = Fastify()
//   t.tearDown(() => app.close())

//   app.register(GQL, {
//     gateway: {
//       services: [{
//         name: 'service-1',
//         url: 'http://localhost:3001/graphql'
//       }]
//     }
//   })

//   await app.ready()

//   try {
//     app.graphql.defineResolvers({
//       Query: {
//         field () {}
//       }
//     })
//   } catch (err) {
//     t.is(err.message, 'Calling defineResolvers method is not allowed when plugin is running in gateway mode is not allowed')
//   }
// })

// test('calling replaceSchema throws an error in gateway mode', async (t) => {
//   await createService(t, 3001, `
//     extend type Query {
//       me: User
//     }

//     type User @key(fields: "id") {
//       id: ID!
//       name: String!
//     }
//   `)

//   const app = Fastify()
//   t.tearDown(() => app.close())

//   app.register(GQL, {
//     gateway: {
//       services: [{
//         name: 'service-1',
//         url: 'http://localhost:3001/graphql'
//       }]
//     }
//   })

//   await app.ready()

//   try {
//     app.graphql.replaceSchema(`
//       type Query {
//         field: String!
//       }
//     `)
//   } catch (err) {
//     t.is(err.message, 'Calling replaceSchema method is not allowed when plugin is running in gateway mode is not allowed')
//   }
// })

// test('calling extendSchema throws an error in gateway mode', async (t) => {
//   await createService(t, 3001, `
//     extend type Query {
//       me: User
//     }

//     type User @key(fields: "id") {
//       id: ID!
//       name: String!
//     }
//   `)

//   const app = Fastify()
//   t.tearDown(() => app.close())

//   app.register(GQL, {
//     gateway: {
//       services: [{
//         name: 'service-1',
//         url: 'http://localhost:3001/graphql'
//       }]
//     }
//   })

//   await app.ready()

//   try {
//     app.graphql.extendSchema(`
//       extend type Query {
//         field: String!
//       }
//     `)
//   } catch (err) {
//     t.is(err.message, 'Calling extendSchema method is not allowed when plugin is running in gateway mode is not allowed')
//   }
// })

test('It builds the gateway schema correctly', async (t) => {
  const users = {
    u1: {
      id: 'u1',
      name: 'John'
    },
    u2: {
      id: 'u2',
      name: 'Jane'
    }
  }

  const posts = {
    p1: {
      id: 'p1',
      title: 'Post 1',
      content: 'Content 1',
      authorId: 'u1'
    },
    p2: {
      id: 'p2',
      title: 'Post 2',
      content: 'Content 2',
      authorId: 'u2'
    },
    p3: {
      id: 'p3',
      title: 'Post 3',
      content: 'Content 3',
      authorId: 'u1'
    },
    p4: {
      id: 'p4',
      title: 'Post 4',
      content: 'Content 4',
      authorId: 'u2'
    }
  }

  await createService(t, 3001, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `, {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    },
    User: {
      __resolveReference: (user, args, context, info) => {
        return users[user.id]
      }
    }
  })

  await createService(t, 3002, `
    type Post @key(fields: "id") {
      id: ID!
      title: String
      content: String
      author: User
    }

    extend type Query {
      topPosts: [Post]
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      posts: [Post]
    }
  `, {
    Post: {
      __resolveReference: (post, args, context, info) => {
        return posts[post.id]
      },
      author: (post, args, context, info) => {
        return {
          __typename: 'User',
          id: post.authorId
        }
      }
    },
    User: {
      posts: (user, args, context, info) => {
        return Object.values(posts).filter(p => p.authorId === user.id)
      }
    }
  })

  const gateway = Fastify()
  t.tearDown(() => gateway.close())
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: 'http://localhost:3001/graphql'
      }, {
        name: 'post',
        url: 'http://localhost:3002/graphql'
      }]
    }
  })

  await gateway.listen(3000)

  const query = '{ me { id name posts { id title content author { id name } } } }'
  const res = await gateway.inject({
    method: 'GET',
    url: `/graphql?query=${query}`
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        posts: [{
          id: 'p1',
          title: 'Post 1',
          content: 'Content 1',
          author: {
            id: 'u1',
            name: 'John'
          }
        }, {
          id: 'p3',
          title: 'Post 3',
          content: 'Content 3',
          author: {
            id: 'u1',
            name: 'John'
          }
        }]
      }
    }
  })
})
