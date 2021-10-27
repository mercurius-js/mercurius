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
  await service.listen(0)

  return [service, service.server.address().port]
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

  const [userService, userServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
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

  t.same(JSON.parse(res.body), {
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

  const [userService, userServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await userService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }]
    }
  })

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

  t.same(JSON.parse(res.body), {
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

  const [postService, postServicePort] = await createService(t, `
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

  const [userService, userServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
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

  t.same(JSON.parse(res.body), {
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

  const [productService, productServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await productService.close()
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

  t.same(JSON.parse(res.body), {
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

  const [postService, postServicePort] = await createService(t, `
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

  const [userService, userServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
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

  t.same(JSON.parse(res.body), {
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
  const [productService, productServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await productService.close()
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

  t.same(JSON.parse(res.body), {
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

  t.same(JSON.parse(res2.body), {
    data: {
      pong: 2
    }
  })
})

test('Should support array references with _entities query and empty response', async (t) => {
  const topPosts = [
    {
      id: 1,
      title: 'test',
      content: 'test',
      authorIds: []
    },
    {
      id: 2,
      title: 'test2',
      content: 'test2',
      authorIds: []
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

  const [postService, postServicePort] = await createService(t, `
    extend type Query {
      topPosts: [Post]
    }

    type Post @key(fields: "id") {
      id: ID!
      title: String
      content: String
      authors: [User]!
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

  const [userService, userServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
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

  t.same(JSON.parse(res.body), {
    data: {
      topPosts: [
        {
          id: 1,
          title: 'test',
          content: 'test',
          authors: []
        },
        {
          id: 2,
          title: 'test2',
          content: 'test2',
          authors: []
        }
      ]
    }
  })
})

test('Should support array references with _entities query and empty response and nullable field', async (t) => {
  const topPosts = [
    {
      id: 1,
      title: 'test',
      content: 'test',
      authorIds: []
    },
    {
      id: 2,
      title: 'test2',
      content: 'test2',
      authorIds: []
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

  const [postService, postServicePort] = await createService(t, `
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

  const [userService, userServicePort] = await createService(t, `
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
  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
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

  t.same(JSON.parse(res.body), {
    data: {
      topPosts: [
        {
          id: 1,
          title: 'test',
          content: 'test',
          authors: null
        },
        {
          id: 2,
          title: 'test2',
          content: 'test2',
          authors: null
        }
      ]
    }
  })
})

test('Should handle union with InlineFragment', async (t) => {
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

  const [productService, productServicePort] = await createService(t, `
    extend type Query {
      products: [Product]
      shelve: Shelve
    }
    enum ProductType {
      Book
    }
    union Product = Book
    type Shelve {
      id: ID!
      products: [Product]
    }
    type Book {
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
      },
      shelve: async () => {
        return {
          id: 1,
          products
        }
      }
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await productService.close()
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

  const query = `
  {
    shelve {
      ...ShelveInfos
    }
  }
  
  fragment ShelveInfos on Shelve {
    id
    products {
      ...on Book {
        id
        type
        name
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
      shelve: {
        id: 1,
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
          }]
      }
    }
  })
})

test('Gateway sends initHeaders with _service sdl query', async (t) => {
  t.plan(1)
  const service = Fastify()
  service.register(GQL, {
    schema: `
      extend type Query {
        hello: String
      }
    `,
    resolvers: {
      Query: {
        hello: async () => {
          return 'world'
        }
      }
    },
    federationMetadata: true
  })
  service.addHook('preHandler', async (req, reply) => {
    t.equal(req.headers.authorization, 'ok')
    if (!req.headers.authorization) throw new Error('Unauthorized')
  })

  await service.listen(0)

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await service.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'svc',
          url: `http://localhost:${service.server.address().port}/graphql`,
          initHeaders: {
            authorization: 'ok'
          }
        }
      ]
    }
  })

  await gateway.ready()
})

test('Gateway sends initHeaders function result with _service sdl query', async (t) => {
  t.plan(1)
  const service = Fastify()
  service.register(GQL, {
    schema: `
      extend type Query {
        hello: String
      }
    `,
    resolvers: {
      Query: {
        hello: async () => {
          return 'world'
        }
      }
    },
    federationMetadata: true
  })
  service.addHook('preHandler', async (req, reply) => {
    t.equal(req.headers.authorization, 'ok')
    if (!req.headers.authorization) throw new Error('Unauthorized')
  })

  await service.listen(0)

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await service.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'svc',
          url: `http://localhost:${service.server.address().port}/graphql`,
          async initHeaders () {
            return {
              authorization: 'ok'
            }
          }
        }
      ]
    }
  })

  await gateway.ready()
})

test('Should handle interface', async (t) => {
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

  const [productService, productServicePort] = await createService(t, `
    extend type Query {
      products: [Product]
      shelve: Shelve
    }
    enum ProductType {
      Book
    }

    type Shelve {
      id: ID!
      products: [Product]
    }

    interface Product {
      id: ID!
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
      },
      shelve: async () => {
        return {
          id: 1,
          products
        }
      }
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await productService.close()
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

  const query = `
  {
    shelve {
      ...ShelveInfos
    }
  }
  
  fragment ShelveInfos on Shelve {
    id
    products {
      ...on Book {
        id
        type
        name
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
      shelve: {
        id: 1,
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
          }]
      }
    }
  })
})

test('Should handle interface referenced multiple times in different services', async (t) => {
  const books = [
    {
      id: 1,
      type: 'Book',
      name: 'book1',
      author: 'toto'
    },
    {
      id: 2,
      type: 'Book',
      name: 'book2',
      author: 'titi'
    }
  ]

  const dictionaries = [
    {
      id: 1,
      type: 'Dictionary',
      name: 'Dictionary 1',
      editor: 'john'
    },
    {
      id: 2,
      type: 'Dictionary',
      name: 'Dictionary 2',
      editor: 'jim'
    }
  ]

  const [bookService, bookServicePort] = await createService(t, `
    extend type Query {
      books: [Book]
    }
    enum ProductType {
      Dictionary
      Book
    }

    interface Product {
      id: ID!
      type: ProductType!
    }

    type Book implements Product @key(fields: "id") {
      id: ID!
      type: ProductType!
      name: String!
      author: String!
    }
  `, {
    Product: {
      resolveType (value) {
        return value.type
      }
    },
    Query: {
      books: async () => {
        return books
      }
    }
  })
  const [dictionariesService, dictionariesServicePort] = await createService(t, `
    extend type Query {
      dictionaries: [Dictionary]
    }
    enum ProductType {
      Dictionary
      Book
    }

    interface Product {
      id: ID!
      type: ProductType!
    }

    type Dictionary implements Product @key(fields: "id") {
      id: ID!
      type: ProductType!
      name: String!
      editor: String!
    }
  `, {
    Product: {
      resolveType (value) {
        return value.type
      }
    },
    Query: {
      dictionaries: async () => {
        return dictionaries
      }
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await dictionariesService.close()
    await bookService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'book',
          url: `http://localhost:${bookServicePort}/graphql`
        },
        {
          name: 'dictionaries',
          url: `http://localhost:${dictionariesServicePort}/graphql`
        }
      ]
    }
  })

  const query1 = `
  {
    books {
      id
      type
      ... on Book {
        name
        author
      }
    }
  }
  `
  const res1 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query: query1 })
  })

  t.same(JSON.parse(res1.body), {
    data: {
      books: [
        {
          id: 1,
          type: 'Book',
          name: 'book1',
          author: 'toto'
        },
        {
          id: 2,
          type: 'Book',
          name: 'book2',
          author: 'titi'
        }
      ]
    }
  })

  const query2 = `
  {
    dictionaries {
      id
      type
      ... on Dictionary {
        name
        editor
      }
    }
  }
  `

  const res2 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query: query2 })
  })

  t.same(JSON.parse(res2.body), {
    data: {
      dictionaries: [
        {
          id: 1,
          type: 'Dictionary',
          name: 'Dictionary 1',
          editor: 'john'
        },
        {
          id: 2,
          type: 'Dictionary',
          name: 'Dictionary 2',
          editor: 'jim'
        }
      ]
    }
  })
})

test('Should handle complex and nested interfaces with external types', async (t) => {
  const users = [
    {
      id: 1,
      name: 'toto'
    },
    {
      id: 2,
      name: 'titi'
    }
  ]

  const configsAB = [
    {
      id: 10,
      userId: 1,
      nestedInterface: {
        type: 'ConfigB',
        property: 'hello'
      }
    },
    {
      id: 11,
      userId: 2,
      nestedInterface: {
        type: 'ConfigB',
        property: 'world'
      }
    },
    {
      id: 12,
      userId: 1,
      nestedInterface: {
        type: 'ConfigA',
        arrayProperty: ['hellow', 'world']
      }
    },
    {
      id: 13,
      userId: 2,
      nestedInterface: {
        type: 'ConfigA',
        arrayProperty: ['world', 'hello']
      }
    }
  ]

  const configsC = [
    {
      id: 20,
      userId: 1,
      nestedInterface: {
        type: 'ConfigC',
        integerValue: 101
      }
    },
    {
      id: 21,
      userId: 2,
      nestedInterface: {
        type: 'ConfigC',
        integerValue: 420
      }
    }
  ]

  const configInterface = `
    interface ConfigInterface {
      type: EConfig!
    }
    enum EConfig {
      ConfigA
      ConfigB
      ConfigC
    }
  `

  const [userService, userServicePort] = await createService(t, `
    type User @key(fields: "id") {
      id: ID!
      name: String!
    }

    extend type Query {
      users: [User]!
    }
  `, {
    User: {
      __resolveReference: (root) => {
        return users.find(u => u.id === root.id)
      }
    },
    Query: {
      users: async () => {
        return users
      }
    }
  })
  const [configABService, configABServicePort] = await createService(t, `
    ${configInterface}
    type ConfigA implements ConfigInterface {
      type: EConfig!
      arrayProperty: [String]
    }
    type ConfigB implements ConfigInterface {
      type: EConfig!
      property: String
    }
    type ServiceConfigAB @key(fields: "id") {
      id: ID!
      nestedInterface: ConfigInterface!
    }

    extend type Query {
      configsA: [ConfigA]
      configsB: [ConfigB]
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      configABs: [ServiceConfigAB]!
    }
  `, {
    ConfigInterface: {
      resolveType (value) {
        return value.type
      }
    },
    User: {
      configABs: async (root) => {
        return configsAB.filter(c => c.userId === Number(root.id))
      }
    },
    Query: {
      configsA: async () => {
        return configsAB
      },
      configsB: async () => {
        return configsAB
      }
    }
  })
  const [configCService, configCServicePort] = await createService(t, `
    ${configInterface}
    type ConfigC implements ConfigInterface {
      type: EConfig!
      integerValue: Int
    }
    type ServiceConfigC @key(fields: "id") {
      id: ID!
      nestedInterface: ConfigInterface!
    }

    extend type Query {
      configsC: [ConfigC]!
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      configCs: [ServiceConfigC]!
    }
  `, {
    ServiceConfigC: {
      __resolveReference (root) {
        return configsC.find(c => c.id === root.id)
      }
    },
    ConfigInterface: {
      resolveType (value) {
        return value.type
      }
    },
    User: {
      configCs: async (root) => {
        return configsC.filter(c => c.userId === Number(root.id))
      }
    },
    Query: {
      configsC: async () => {
        return configsC
      }
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await configCService.close()
    await configABService.close()
    await userService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        },
        {
          name: 'configAB',
          url: `http://localhost:${configABServicePort}/graphql`
        },
        {
          name: 'configC',
          url: `http://localhost:${configCServicePort}/graphql`
        }
      ]
    }
  })

  const query = `
  {
    users {
      id
      name
      configABs {
        id
        nestedInterface {
          type
          ... on ConfigA {
            arrayProperty
          }
          ... on ConfigB {
            property
          }
        }
      }
      configCs {
        id
        nestedInterface {
          type
          ... on ConfigC {
            integerValue
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
      users: [
        {
          id: '1',
          name: 'toto',
          configABs: [
            {
              id: '10',
              nestedInterface: {
                type: 'ConfigB',
                property: 'hello'
              }
            },
            {
              id: '12',
              nestedInterface: {
                type: 'ConfigA',
                arrayProperty: ['hellow', 'world']
              }
            }
          ],
          configCs: [
            {
              id: '20',
              nestedInterface: {
                type: 'ConfigC',
                integerValue: 101
              }
            }
          ]
        },
        {
          id: '2',
          name: 'titi',
          configABs: [
            {
              id: '11',
              nestedInterface: {
                type: 'ConfigB',
                property: 'world'
              }
            },
            {
              id: '13',
              nestedInterface: {
                type: 'ConfigA',
                arrayProperty: ['world', 'hello']
              }
            }
          ],
          configCs: [
            {
              id: '21',
              nestedInterface: {
                type: 'ConfigC',
                integerValue: 420
              }
            }
          ]
        }
      ]
    }
  })
})

test('Uses the supplied schema for federation rather than fetching it remotely', async (t) => {
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

  const [userService, userServicePort] = await createService(t, `
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

  const postServiceSdl = `
    type Post @key(fields: "pid") {
      pid: ID!
      title: String
      content: String
      author: User @requires(fields: "title")
    }

    extend type Query {
      topPosts(count: Int): [Post]
      _service: String
    }

    type User @key(fields: "id") @extends {
      id: ID! @external
      name: String @external
      posts: [Post]
      numberOfPosts: Int @requires(fields: "id")
    }
  `

  const [postService, postServicePort] = await createService(t, postServiceSdl, {
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
      topPosts: (root, { count = 2 }) => Object.values(posts).slice(0, count),
      _service: () => new Error('Not supposed to retrieve this')
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
        url: `http://localhost:${postServicePort}/graphql`,
        schema: postServiceSdl
      }]
    }
  })

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
      'content-type': 'application/json'
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

  t.same(JSON.parse(res.body), {
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

test('Non mandatory gateway failure wont stop gateway creation', async (t) => {
  const [brokenService, brokenServicePort] = await createService(t, `
    extend type Query {
      _service: String
    }
  `, {
    Query: {
      _service: () => {
        throw new Error()
      }
    }
  })

  const [workingService, workingServicePort] = await createService(t, `
    extend type Query {
      hello: String!
    }
  `, {
    Query: {
      hello: () => 'world'
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await brokenService.close()
    await workingService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'working',
        url: `http://localhost:${workingServicePort}/graphql`
      }, {
        name: 'broken',
        url: `http://localhost:${brokenServicePort}/graphql`
      }]
    }
  })

  const query = `
    query {
      hello
    }`
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
      hello: 'world'
    }
  })
})

test('Update the schema', async (t) => {
  const schema = `
    extend type Query {
      hello: String!
    }
  `

  const fullSchema = `
    extend type Query {
      hello: String
      world: String
    }
  `

  const [service, servicePort] = await createService(t, fullSchema, {
    Query: {
      hello: () => 'world',
      world: () => 'hello'
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await service.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'working',
        url: `http://localhost:${servicePort}/graphql`,
        schema
      }]
    }
  })

  const query = `
    query {
      hello
      world
    }`
  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(
    JSON.parse(res.body).errors[0].message,
    'Cannot query field "world" on type "Query".'
  )

  gateway.graphql.gateway.serviceMap.working.setSchema(fullSchema)
  const newSchema = await gateway.graphql.gateway.refresh()

  gateway.graphql.replaceSchema(newSchema)

  const res2 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res2.body), {
    data: {
      hello: 'world',
      world: 'hello'
    }
  })
})

test('Update the schema without any changes', async (t) => {
  const schema = `
    extend type Query {
      hello: String!
    }
  `

  const [service, servicePort] = await createService(t, schema, {
    Query: {
      hello: () => 'world'
    }
  })

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await service.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'working',
        url: `http://localhost:${servicePort}/graphql`,
        schema
      }]
    }
  })

  const query = `
    query {
      hello
    }`
  const res = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(
    JSON.parse(res.body), {
      data: {
        hello: 'world'
      }
    }
  )

  gateway.graphql.gateway.serviceMap.working.setSchema(schema)
  const newSchema = await gateway.graphql.gateway.refresh()

  t.equal(newSchema, null)
})
