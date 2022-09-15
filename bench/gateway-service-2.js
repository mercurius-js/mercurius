'use strict'

const Fastify = require('fastify')
const mercurius = require('..')

const app = Fastify()

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
    authorId: 'u1'
  }
}

const schema = `
directive @auth(
  requires: Role = ADMIN,
) on OBJECT | FIELD_DEFINITION

enum Role {
  ADMIN
  REVIEWER
  USER
  UNKNOWN
}

type Post @key(fields: "pid") {
  pid: ID!
  author: User @auth(requires: ADMIN)
}

extend type Query {
  topPosts(count: Int): [Post] @auth(requires: ADMIN)
}

type User @key(fields: "id") @extends {
  id: ID! @external
  topPosts(count: Int!): [Post]
}`

const resolvers = {
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
    topPosts: (user, { count }, context, info) => {
      return Object.values(posts).filter(p => p.authorId === user.id).slice(0, count)
    }
  },
  Query: {
    topPosts: (root, { count = 2 }) => Object.values(posts).slice(0, count)
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  federationMetadata: true,
  graphiql: false,
  jit: 1
})

app.listen({ port: 3002 })
