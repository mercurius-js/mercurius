'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createService (t, schema, resolvers = {}) {
  const service = Fastify()
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
  })
  await service.listen({ port: 0 })

  return [service, service.server.address().port]
}

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
  }
}

test('gateway handles @extends directive correctly', async (t) => {
  const [userService, userServicePort] = await createService(t, `
    type Query @extends {
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

  const [postService, postServicePort] = await createService(t, `
    type Post @key(fields: "pid") {
      pid: ID!
      title: String
      content: String
      author: User @requires(fields: "title")
    }

    extend type Query {
      topPosts(count: Int): [Post]
    }

    type User @key(fields: "id") @extends {
      id: ID! @external
      posts: [Post]
      numberOfPosts: Int
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
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }]
    }
  })

  const query = `
    query {
      me {
        id
        name
        numberOfPosts
      }
    }
  `

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query
    })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        numberOfPosts: 1
      }
    }
  })
})

test('gateway passes field arguments through to types labeled by @extends directive correctly', async (t) => {
  const userPosts = {
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

  const [userService, userServicePort] = await createService(t, `
    type Query @extends {
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

  const [postService, postServicePort] = await createService(t, `
    type Post @key(fields: "pid") {
      pid: ID!
      author: User
    }

    type User @key(fields: "id") @extends {
      id: ID! @external
      topPosts(count: Int!): [Post]
    }
  `, {
    Post: {
      __resolveReference: (post, args, context, info) => {
        return userPosts[post.pid]
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
        return Object.values(userPosts).filter(p => p.authorId === user.id).slice(0, count)
      }
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }]
    }
  })

  const query = `
    query {
      me {
        id
        name
        topPosts(count: 2) {
          pid
          author {
            id
          }
        }
      }
    }
  `

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query
    })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        topPosts: [
          {
            pid: 'p1',
            author: {
              id: 'u1'
            }
          },
          {
            pid: 'p3',
            author: {
              id: 'u1'
            }
          }
        ]
      }
    }
  })
})

test('gateway distributes query correctly to services when querying with inline fragments', async (t) => {
  const userPosts = {
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

  const [userService, userServicePort] = await createService(t, `
    type Query @extends {
      me: UserUnion
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
    }

    type Admin {
      id: ID!
    }

    union UserUnion = User | Admin
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

  const [postService, postServicePort] = await createService(t, `
    type Post @key(fields: "pid") {
      pid: ID!
      author: User
    }

    type User @key(fields: "id") @extends {
      id: ID! @external
      topPosts(count: Int!): [Post]
    }
  `, {
    Post: {
      __resolveReference: (post, args, context, info) => {
        return userPosts[post.pid]
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
        return Object.values(userPosts).filter(p => p.authorId === user.id).slice(0, count)
      }
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }]
    }
  })

  await gateway.listen({ port: 0 })

  const query = `
    query {
      me {
        ... on User {
          id
          name
          topPosts(count: 2) {
            pid
            author {
              id
              topPosts(count: 1) {
                pid
              }
            }
          }
        }
      }
    }
  `

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        topPosts: [
          {
            pid: 'p1',
            author: {
              id: 'u1',
              topPosts: [
                {
                  pid: 'p1'
                }
              ]
            }
          },
          {
            pid: 'p3',
            author: {
              id: 'u1',
              topPosts: [
                {
                  pid: 'p1'
                }
              ]
            }
          }
        ]
      }
    }
  })
})

test('gateway handles missing @key', async (t) => {
  // This service is missing a @key
  const [userService, userServicePort] = await createService(t, `
    type Query @extends {
      me: User
    }

    type User {
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

  const [postService, postServicePort] = await createService(t, `
    type Post @key(fields: "pid") {
      pid: ID!
      title: String
      content: String
      author: User @requires(fields: "title")
    }

    extend type Query {
      topPosts(count: Int): [Post]
    }

    type User @key(fields: "id") @extends {
      id: ID! @external
      posts: [Post]
      numberOfPosts: Int
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
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }]
    }
  })

  const query = `
    query {
      me {
        id
        name
        numberOfPosts
      }
    }
  `

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query
    })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        numberOfPosts: null
      }
    },
    errors: [{
      message: 'Missing @key directive in User type',
      locations: [{
        line: 6,
        column: 9
      }],
      path: [
        'me',
        'numberOfPosts'
      ]
    }]
  })
})
