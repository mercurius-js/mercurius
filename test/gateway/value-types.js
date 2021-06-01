'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const FakeTimers = require('@sinonjs/fake-timers')
const { promisify } = require('util')
const immediate = promisify(setImmediate)
const buildFederationSchema = require('../../lib/federation')
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

const userSchema = `
    extend type Query {
      users: UserConnection!
    }
    
    type UserConnection {
      pageInfo: PageInfo!
      edges: [UserEdge!]!
    }
    
    type PageInfo {
      hasNextPage: Boolean
    }
    
    type UserEdge {
      node: User!
    }

    type User @key(fields: "id") {
      id: ID!
    }
`

const usersData = {
  data: {
    users: {
      pageInfo: {
        hasNextPage: false
      },
      edges: [
        {
          node: {
            id: '1'
          }
        }
      ]
    }
  }
}

const userResolvers = {
  User: {
    __resolveReference: (post, args, context, info) => {
      return { id: '1' }
    }
  },
  Query: {
    users: (root, args, context, info) => {
      return usersData.data.users
    }
  }
}

const usersQuery = `
  query {
    users {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
        }
      }
    }
  }`

const postSchema = `
    extend type Query {
      posts: PostConnection!
    }
    
    type PostConnection {
      pageInfo: PageInfo!
      edges: [PostEdge!]!
    }
    
    type PageInfo {
      hasNextPage: Boolean
    }
    
    type PostEdge {
      node: Post!
    }

    type Post @key(fields: "id") {
      id: ID!
    }
`

const postsData = {
  data: {
    posts: {
      pageInfo: {
        hasNextPage: false
      },
      edges: [
        {
          node: {
            id: '1'
          }
        }
      ]
    }
  }
}

const postResolvers = {
  Post: {
    __resolveReference: (post, args, context, info) => {
      return { id: '1' }
    }
  },
  Query: {
    posts: (root, args, context, info) => {
      return postsData.data.posts
    }
  }
}

const postsQuery = `
  query {
    posts {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
        }
      }
    }
}`

const commentSchema = `
    extend type Query {
      comments: CommentConnection!
    }
    
    type CommentConnection {
      pageInfo: PageInfo!
      edges: [CommentEdge!]!
    }
    
    type PageInfo {
      hasNextPage: Boolean
    }
    
    type CommentEdge {
      node: Comment!
    }

    type Comment @key(fields: "id") {
      id: ID!
    }
`

const commentsData = {
  data: {
    comments: {
      pageInfo: {
        hasNextPage: false
      },
      edges: [
        {
          node: {
            id: '1'
          }
        }
      ]
    }
  }
}

const commentResolvers = {
  Comment: {
    __resolveReference: (post, args, context, info) => {
      return { id: '1' }
    }
  },
  Query: {
    comments: (root, args, context, info) => {
      return commentsData.data.comments
    }
  }
}

const commentsQuery = `
  query {
    comments {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
        }
      }
    }
}`

test('Should be able to query with value types', async (t) => {
  const [userService, userServicePort] = await createService(t, userSchema, userResolvers)
  const [postService, postServicePort] = await createService(t, postSchema, postResolvers)
  const [commentService, commentServicePort] = await createService(t, commentSchema, commentResolvers)

  const gateway = Fastify()

  t.teardown(async () => {
    await gateway.close()
    await postService.close()
    await userService.close()
    await commentService.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }, {
        name: 'comment',
        url: `http://localhost:${commentServicePort}/graphql`
      }]
    }
  })

  const usersRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: usersQuery
    })
  })

  t.same(usersRes.json(), usersData)

  const postsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: postsQuery
    })
  })

  t.same(postsRes.json(), postsData)

  const commentsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: commentsQuery
    })
  })

  t.same(commentsRes.json(), commentsData)
})

test('Should be able to query with value types and polling', async (t) => {
  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })
  t.teardown(() => clock.uninstall())

  const [userService, userServicePort] = await createService(t, userSchema, userResolvers)
  const [postService, postServicePort] = await createService(t, postSchema, postResolvers)
  const [commentService, commentServicePort] = await createService(t, commentSchema, commentResolvers)

  const gateway = Fastify()

  t.teardown(async () => {
    await gateway.close()
    await userService.close()
    await postService.close()
    await commentService.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }, {
        name: 'comment',
        url: `http://localhost:${commentServicePort}/graphql`
      }],
      pollingInterval: 2000
    }
  })

  const postsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: postsQuery
    })
  })

  t.same(postsRes.json(), postsData)

  const helloQuery = `
    query {
      hello
    }
  `

  const helloRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: helloQuery
    })
  })

  t.same(helloRes.json(), {
    errors: [
      {
        message:
          'Cannot query field "hello" on type "Query".',
        locations: [{ line: 3, column: 7 }]
      }
    ],
    data: null
  })

  postService.graphql.replaceSchema(
    buildFederationSchema(`
      ${postSchema}
      extend type Query {
        hello: String!
      }
    `)
  )
  postService.graphql.defineResolvers({
    ...postResolvers,
    Query: {
      hello: () => 'world',
      ...postResolvers.Query
    }
  })

  await clock.tickAsync(2000)

  // We need the event loop to actually spin twice to
  // be able to propagate the change
  await immediate()
  await immediate()

  const postsRes2 = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: helloQuery
    })
  })

  t.same(postsRes2.json(), {
    data: {
      hello: 'world'
    }
  })
})

test('Should use last service in list for duplicate entity types', async (t) => {
  const [userServiceA, userServicePortA] = await createService(t, `   
    type User @key(fields: "id") {
      id: ID!
    }
  `, {})

  const [userServiceB, userServicePortB] = await createService(t, `
    extend type Query {
        user: User!
    }
   
    type User @key(fields: "id") {
      id: ID!
    }
  `, {
    Query: {
      user: () => {
        return { id: '1' }
      }
    }
  })

  const gateway = Fastify()

  t.teardown(async () => {
    await gateway.close()
    await userServiceA.close()
    await userServiceB.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'userB',
        url: `http://localhost:${userServicePortA}/graphql`
      }, {
        name: 'userA',
        url: `http://localhost:${userServicePortB}/graphql`
      }]
    }
  })

  const usersRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: `
        query {
          user {
            id
          }
        }`
    })
  })

  t.same(usersRes.json(), {
    data: {
      user: {
        id: '1'
      }
    }
  })
})
