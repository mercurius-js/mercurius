'use strict'
const Fastify = require('fastify')
const GQL = require('..')

async function createService (port, schema, resolvers = {}) {
  const service = Fastify()

  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true,
    graphiql: true
  })
  await service.listen(port)
}

const users = {
  u1: {
    id: 'u1',
    name: 'John'
  },
  u2: {
    id: 'u2',
    name: 'Jane'
  },
  u3: {
    id: 'u3',
    name: 'Jack'
  }
}

const posts = {
  p1: {
    pid: 'p1',
    title: 'Post 1',
    content: 'Content 1',
    authorId: 'u1'
  },
  p2: {
    pid: 'p2',
    title: 'Post 2',
    content: 'Content 2',
    authorId: 'u2'
  },
  p3: {
    pid: 'p3',
    title: 'Post 3',
    content: 'Content 3',
    authorId: 'u1'
  },
  p4: {
    pid: 'p4',
    title: 'Post 4',
    content: 'Content 4',
    authorId: 'u2'
  }
}

async function start () {
  await createService(4001, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
      avatar(size: AvatarSize): String
      friends: [User]
    }

    enum AvatarSize {
      small
      medium
      large
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
      },
      avatar: (user, { size }) => `avatar-${size}.jpg`,
      friends: (user) => Object.values(users).filter(u => u.id !== user.id)
    }
  })

  await createService(4002, `
    type Post @key(fields: "pid") {
      pid: ID!
      title: String
      content: String
      author: User @requires(fields: "pid title")
    }

    extend type Query {
      topPosts(count: Int): [Post]
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      posts: [Post]
    }

    extend type Mutation {
      createPost(post: PostInput!): Post
    }

    input PostInput {
      title: String!
      content: String!
      authorId: String!
    }
  `, {
    Post: {
      __resolveReference: (post, args, context, info) => {
        return posts[post.pid]
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
      topPosts: (root, { count = 2 }) => Object.values(posts).slice(0, count)
    },
    Mutation: {
      createPost: (root, { post }) => {
        const pid = `p${Object.values(posts).length + 1}`

        const result = {
          pid,
          ...post
        }
        posts[pid] = result

        return result
      }
    }
  })

  const gateway = Fastify()
  gateway.register(GQL, {
    graphiql: true,
    gateway: {
      services: [{
        name: 'user',
        url: 'http://localhost:4001/graphql'
      }, {
        name: 'post',
        url: 'http://localhost:4002/graphql'
      }]
    }
  })

  await gateway.listen(4000)
}

start()