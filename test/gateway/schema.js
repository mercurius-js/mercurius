'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createService (t, schema, resolvers = {}) {
  const service = Fastify()
  t.tearDown(() => {
    service.close()
  })
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
  })
  await service.listen(0)

  return service.server.address().port
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

  const userServicePort = await createService(t, `
    directive @customDirective on FIELD_DEFINITION

    extend type Query {
      me: User
      hello: String
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
      },
      hello: () => 'World'
    },
    User: {
      __resolveReference: (user, args, context, info) => {
        return users[user.id]
      },
      avatar: (user, { size }) => `avatar-${size}.jpg`,
      friends: (user) => Object.values(users).filter(u => u.id !== user.id)
    }
  })

  const postServicePort = await createService(t, `
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
      name: String @external
      posts: [Post]
      numberOfPosts: Int @requires(fields: "id")
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
  t.tearDown(() => {
    gateway.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`,
        rewriteHeaders: (headers) => {
          if (headers.authorization) {
            return {
              authorization: headers.authorization
            }
          }
        }
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }]
    }
  })

  await gateway.listen(0)

  const query = `
  query MainQuery(
    $size: AvatarSize
    $count: Int
  ) {
    me {
      id
      name
      avatar(size: $size)
      friends {
        ...UserFragment
        friends {
          ...UserFragment
        }
      }
      posts {
        ...PostFragment
      }
      numberOfPosts
    }
    topPosts(count: $count) {
      ...PostFragment
    }
    hello
  }

  fragment UserFragment on User {
    id
    name
    avatar(size: medium)
    numberOfPosts
  }

  fragment PostFragment on Post {
    pid
    title
    content
    ...AuthorFragment
  }
  
  fragment AuthorFragment on Post {
    author {
      ...UserFragment
    }
  }`
  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'bearer supersecret'
    },
    url: '/graphql',
    body: JSON.stringify({
      query,
      variables: {
        size: 'small',
        count: 1
      }
    })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        avatar: 'avatar-small.jpg',
        friends: [{
          id: 'u2',
          name: 'Jane',
          avatar: 'avatar-medium.jpg',
          numberOfPosts: 2,
          friends: [{
            id: 'u1',
            name: 'John',
            avatar: 'avatar-medium.jpg',
            numberOfPosts: 2
          }, {
            id: 'u3',
            name: 'Jack',
            avatar: 'avatar-medium.jpg',
            numberOfPosts: 0
          }]
        }, {
          id: 'u3',
          name: 'Jack',
          avatar: 'avatar-medium.jpg',
          numberOfPosts: 0,
          friends: [{
            id: 'u1',
            name: 'John',
            avatar: 'avatar-medium.jpg',
            numberOfPosts: 2
          }, {
            id: 'u2',
            name: 'Jane',
            avatar: 'avatar-medium.jpg',
            numberOfPosts: 2
          }]
        }],
        posts: [{
          pid: 'p1',
          title: 'Post 1',
          content: 'Content 1',
          author: {
            id: 'u1',
            name: 'John',
            avatar: 'avatar-medium.jpg',
            numberOfPosts: 2
          }
        }, {
          pid: 'p3',
          title: 'Post 3',
          content: 'Content 3',
          author: {
            id: 'u1',
            name: 'John',
            avatar: 'avatar-medium.jpg',
            numberOfPosts: 2
          }
        }],
        numberOfPosts: 2
      },
      topPosts: [{
        pid: 'p1',
        title: 'Post 1',
        content: 'Content 1',
        author: {
          id: 'u1',
          name: 'John',
          avatar: 'avatar-medium.jpg',
          numberOfPosts: 2
        }
      }],
      hello: 'World'
    }
  })
})

test('It support variable inside nested arguments', async (t) => {
  const user = {
    id: 'u1',
    name: {
      firstName: 'John',
      lastName: 'Doe'
    }
  }

  const userServicePort = await createService(t, `
    directive @customDirective on FIELD_DEFINITION

    extend type Query {
      me (user: UserInput!): User
    }

    input UserInput {
      id: ID!
      name: UserNameInput!
    }

    input UserNameInput {
      firstName: String!
      lastName: String!
    }

    type User @key(fields: "id") {
      id: ID!
      name: UserName!
    }

    type UserName {
      firstName: String!
      lastName: String!
    }
  `, {
    Query: {
      me: (root, args, context, info) => {
        return args.user
      }
    }
  })

  const gateway = Fastify()
  t.tearDown(() => {
    gateway.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }]
    }
  })

  await gateway.listen(0)

  const query = `
  query MainQuery(
    $userId: ID!
    $userFirstName: String!
    $userLastName: String!
  ){
    me (
      user: {
        id: $userId
        name: {
          firstName: $userFirstName
          lastName: $userLastName
        }
      }
    ) {
      id
      name {
        firstName
        lastName
      }
    }
  }`

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query,
      variables: {
        userId: user.id,
        userFirstName: user.name.firstName,
        userLastName: user.name.lastName
      }
    })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: user
    }
  })
})

test('Should not throw on nullable reference', async (t) => {
  const topPosts = [
    {
      id: 1,
      title: 'test',
      content: 'test'
    },
    {
      id: 2,
      title: 'test2',
      content: 'test2',
      authorId: 1
    }
  ]

  const users = [
    {
      id: 1,
      name: 'toto'
    }
  ]

  const postServicePort = await createService(t, `
    extend type Query {
      topPosts: [Post]
    }

    type Post @key(fields: "id") {
      id: ID!
      title: String
      content: String
      author: User
    }

    extend type User @key(fields: "id") {
      id: ID! @external
    }
  `, {
    Post: {
      author: async (root) => {
        if (root.authorId) {
          return { __typename: 'User', id: root.authorId }
        }
      }
    },
    Query: {
      topPosts: async () => {
        return topPosts
      }
    }
  })

  const userServicePort = await createService(t, `
    type User @key(fields: "id") {
      id: ID!
      name: String
    }
  `, {
    User: {
      __resolveReference: async (reference) => {
        if (reference.id) {
          return users.find(u => u.id === parseInt(reference.id))
        }
      }
    }
  })

  const gateway = Fastify()
  t.tearDown(() => {
    gateway.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'post',
          url: `http://localhost:${postServicePort}/graphql`
        },
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ]
    }
  })

  await gateway.listen(0)

  const query = `
  {
    topPosts{
      id
      title
      content
      author {
        id
        name
      }
    }
  }`

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      topPosts: [
        {
          id: 1,
          title: 'test',
          content: 'test',
          author: null
        },
        {
          id: 2,
          title: 'test2',
          content: 'test2',
          author: {
            id: 1,
            name: 'toto'
          }
        }
      ]
    }
  })
})

test('Should handle InlineFragment', async (t) => {
  const products = [
    {
      id: 1,
      type: 'Book',
      name: 'book1'
    },
    {
      id: 2,
      type: 'Book',
      name: 'book2'
    }
  ]

  const productServicePort = await createService(t, `
    extend type Query {
      products: [Product]
    }

    enum ProductType {
      Book
    }

    interface Product {
      type: ProductType!
    }

    type Book implements Product {
      id: ID!
      type: ProductType!
      name: String
    }
  `, {
    Product: {
      resolveType (value) {
        return value.type
      }
    },
    Query: {
      products: async () => {
        return products
      }
    }
  })

  const gateway = Fastify()
  t.tearDown(() => {
    gateway.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'product',
          url: `http://localhost:${productServicePort}/graphql`
        }
      ]
    }
  })

  await gateway.listen(0)

  const query = `
  {
    products{
      ...on Book {
        id
        type
        name
      }
    }
  }`

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      products: [
        {
          id: 1,
          type: 'Book',
          name: 'book1'
        },
        {
          id: 2,
          type: 'Book',
          name: 'book2'
        }
      ]
    }
  })
})

test('Should support array references with _entities query', async (t) => {
  const topPosts = [
    {
      id: 1,
      title: 'test',
      content: 'test',
      authorIds: [1, 2]
    },
    {
      id: 2,
      title: 'test2',
      content: 'test2',
      authorIds: [3]
    }
  ]

  const users = [
    {
      id: 1,
      name: 'toto'
    },
    {
      id: 2,
      name: 'titi'
    },
    {
      id: 3,
      name: 'tata'
    }
  ]

  const postServicePort = await createService(t, `
    extend type Query {
      topPosts: [Post]
    }

    type Post @key(fields: "id") {
      id: ID!
      title: String
      content: String
      authors: [User]
    }

    extend type User @key(fields: "id") {
      id: ID! @external
    }
  `, {
    Post: {
      authors: async (root) => {
        if (root.authorIds) {
          return root.authorIds.map(id => ({ __typename: 'User', id }))
        }
      }
    },
    Query: {
      topPosts: async () => {
        return topPosts
      }
    }
  })

  const userServicePort = await createService(t, `
    type User @key(fields: "id") {
      id: ID!
      name: String
    }
  `, {
    User: {
      __resolveReference: async (reference) => {
        if (reference.id) {
          return users.find(u => u.id === parseInt(reference.id))
        }
      }
    }
  })

  const gateway = Fastify()
  t.tearDown(() => {
    gateway.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'post',
          url: `http://localhost:${postServicePort}/graphql`
        },
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ]
    }
  })

  await gateway.listen(0)

  const query = `
  {
    topPosts{
      id
      title
      content
      authors {
        id
        name
      }
    }
  }`

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      topPosts: [
        {
          id: 1,
          title: 'test',
          content: 'test',
          authors: [
            {
              id: 1,
              name: 'toto'
            },
            {
              id: 2,
              name: 'titi'
            }
          ]
        },
        {
          id: 2,
          title: 'test2',
          content: 'test2',
          authors: [
            {
              id: 3,
              name: 'tata'
            }
          ]
        }
      ]
    }
  })
})

test('Should support multiple `extends` of the same type in the service SDL', async (t) => {
  const productServicePort = await createService(t, `
    extend type Query {
      ping: Int
    }
    extend type Query {
      pong: Int
    }
  `, {
    Query: {
      ping: async () => {
        return 1
      },
      pong: async () => {
        return 2
      }
    }
  })

  const gateway = Fastify()
  t.tearDown(() => {
    gateway.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'product',
          url: `http://localhost:${productServicePort}/graphql`
        }
      ]
    }
  })

  await gateway.listen(0)

  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: '{ ping }'
    })
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      ping: 1
    }
  })

  const res2 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: '{ pong }'
    })
  })

  t.deepEqual(JSON.parse(res2.body), {
    data: {
      pong: 2
    }
  })
})
