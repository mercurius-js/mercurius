'use strict'
const Fastify = require('fastify')
const mercuriusWithFederation = require('@mercuriusjs/federation')
const mercuriusWithGateway = require('@mercuriusjs/gateway')
const mercurius = require('..')
const { ErrorWithProps } = mercurius

async function createService (port, schema, resolvers = {}) {
  const service = Fastify()

  service.register(mercuriusWithFederation, {
    schema,
    resolvers,
    graphiql: true,
    jit: 1
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
      you: User
      hello: String
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
      },
      you: (root, args, context, info) => {
        throw new ErrorWithProps('Can\'t fetch other users data', { code: 'NOT_ALLOWED' })
      },
      hello: () => 'world'
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

    type Query @extends {
      topPosts(count: Int): [Post]
    }

    type User @key(fields: "id") @extends {
      id: ID! @external
      name: String @external
      posts: [Post]
      numberOfPosts: Int @requires(fields: "id name")
    }

    extend type Mutation {
      createPost(post: PostInput!): Post
      updateHello: String
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
      },
      updateHello: () => 'World'
    }
  })

  const gateway = Fastify()
  gateway.register(mercuriusWithGateway, {
    graphiql: true,
    jit: 1,
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

  await gateway.ready()

  gateway.graphql.addHook('preParsing', async function (schema, source, context) {
    console.log('preParsing called')
  })

  gateway.graphql.addHook('preValidation', async function (schema, document, context) {
    console.log('preValidation called')
  })

  gateway.graphql.addHook('preExecution', async function (schema, document, context) {
    console.log('preExecution called')
    return {
      document,
      errors: [
        new Error('foo')
      ]
    }
  })

  gateway.graphql.addHook('preGatewayExecution', async function (schema, document, context, service) {
    console.log('preGatewayExecution called', service.name)
    return {
      document,
      errors: [
        new Error('foo')
      ]
    }
  })

  gateway.graphql.addHook('onResolution', async function (execution, context) {
    console.log('onResolution called')
  })

  gateway.graphql.addHook('onGatewayReplaceSchema', async (instance, schema) => {
    console.log('onGatewayReplaceSchema called')
  })

  await gateway.listen({ port: 4000 })
}

start()
