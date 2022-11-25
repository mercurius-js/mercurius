'use strict'
const Fastify = require('fastify')
const mercuriusWithFederation = require('@mercuriusjs/federation')
const mercuriusWithGateway = require('@mercuriusjs/gateway')

async function createService (port, schema, resolvers = {}) {
  const service = Fastify()

  service.register(mercuriusWithFederation, {
    schema,
    resolvers,
    ide: true,
    routes: true,
    jit: 1,
    subscription: true
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

const comments = {}

async function start () {
  await createService(4001, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
      fullName: String
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
      friends: (user) => Object.values(users).filter(u => u.id !== user.id),
      fullName: (user) => user.name + ' Doe'
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
      name: String @external
      posts: [Post]
      numberOfPosts: Int @requires(fields: "id name")
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
      },
      numberOfPosts: (user) => {
        return Object.values(posts).filter(p => p.authorId === user.id).length
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

  await createService(4003, `
    type Comment @key(fields: "cid") {
      cid: ID!
      text: String!
      author: User
      post: Post
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      comments: [Comment]
    }

    extend type Post @key(fields: "pid") {
      pid: ID! @external
      comments: [Comment]
    }

    input CommentInput {
      text: String!
      authorId: ID!
      postId: ID!
    }

    extend type Mutation {
      addComment(comment: CommentInput): Comment
    }

    extend type Subscription {
      commentAdded(postId: ID!): Comment
    }
  `, {
    Comment: {
      __resolveReference: (comment) => {
        return comments[comment.id]
      },
      author: (comment) => {
        return {
          __typename: 'User',
          id: comment.authorId
        }
      },
      post: (comment) => {
        return {
          __typename: 'Post',
          pid: comment.postId
        }
      }
    },
    Post: {
      comments: (post) => {
        return Object.values(comments).filter(c => post.pid === c.postId)
      }
    },
    User: {
      comments: (user) => {
        return Object.values(comments).filter(c => user.id === c.authorId)
      }
    },
    Mutation: {
      async addComment (parent, { comment }, { pubsub }) {
        const cid = `c${Object.values(comments).length + 1}`

        const result = {
          cid,
          ...comment
        }
        comments[cid] = result

        await pubsub.publish({
          topic: `COMMENT_ADDED_${comment.postId}`,
          payload: {
            commentAdded: result
          }
        })
        return result
      }
    },
    Subscription: {
      commentAdded: {
        subscribe: async (root, { postId }, { pubsub }) => {
          const subscription = await pubsub.subscribe(`COMMENT_ADDED_${postId}`)

          return subscription
        }
      }
    }
  })

  const gateway = Fastify()
  gateway.register(mercuriusWithGateway, {
    routes: true,
    ide: true,
    subscription: true,
    jit: 1,
    gateway: {
      services: [{
        name: 'user',
        url: 'http://localhost:4001/graphql'
      }, {
        name: 'post',
        url: 'http://localhost:4002/graphql'
      }, {
        name: 'comment',
        url: 'http://localhost:4003/graphql',
        wsUrl: 'ws://localhost:4003/graphql',
        wsConnectionParams: {
          // OPTIONAL: uncomment this line if you are using the `subscriptions-transport-ws` library
          // protocols: ['graphql-ws']
        },
        keepAlive: 3000
      }]
    }
  })

  await gateway.listen({ port: 4000 })
}

start()
