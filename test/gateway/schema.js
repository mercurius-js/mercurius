'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

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
    },
    Query: {
      topPosts: () => Object.values(posts)
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
