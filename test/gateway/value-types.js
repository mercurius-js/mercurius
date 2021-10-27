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

const returnTypeValue = {
  someValue: 'test'
}

const userSchema = `
    extend type Query {
      users: UserConnection!
      userServiceInfo: SomeReturnType!
    }
    
    extend type Mutation {
      userMutation: SomeReturnType!
    }
    
    type SomeReturnType {
      someValue: String!
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
    
    type FileConnection {
      pageInfo: PageInfo!
      edges: [FileEdge!]!
    }
    
    type FileEdge {
      node: File!
    }
    
    type File {
      id: String!
      name: String!
    }

    type User @key(fields: "id") {
      id: ID!
      files: FileConnection!
    }
`

const usersWithFilesData = {
  data: {
    users: {
      pageInfo: {
        hasNextPage: false
      },
      edges: [
        {
          node: {
            id: '1',
            files: {
              pageInfo: {
                hasNextPage: false
              },
              edges: [
                {
                  node: {
                    id: '1',
                    name: 'test.txt'
                  }
                }
              ]
            }
          }
        }
      ]
    }
  }
}

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

const userMutationData = {
  data: {
    userMutation: returnTypeValue
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
      return usersWithFilesData.data.users
    },
    userServiceInfo: (root, args, context, info) => {
      return returnTypeValue
    }
  },
  Mutation: {
    userMutation: () => {
      return returnTypeValue
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
  }
`

const usersWithFilesQuery = `
  query {
    users {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
          files {
            pageInfo {
              hasNextPage
            }
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`

const userServiceInfoQuery = `
  query {
    userServiceInfo {
      someValue
    }
  }
`

const userMutation = `
  mutation {
    userMutation {
      someValue
    }
  }  
`

const postSchema = `
    extend type Query {
      posts: PostConnection!
      postServiceInfo: SomeReturnType!
    }
    
    extend type Mutation {
      postMutation: SomeReturnType!
    }
    
    type SomeReturnType {
      someValue: String!
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
    
    type FileConnection {
      pageInfo: PageInfo!
      edges: [FileEdge!]!
    }
    
    type FileEdge {
      node: File!
    }
    
    type File {
      id: String!
      name: String!
    }

    type Post @key(fields: "id") {
      id: ID!
      files: FileConnection!
    }
`

const postsWithFilesData = {
  data: {
    posts: {
      pageInfo: {
        hasNextPage: false
      },
      edges: [
        {
          node: {
            id: '1',
            files: {
              pageInfo: {
                hasNextPage: false
              },
              edges: [
                {
                  node: {
                    id: '1',
                    name: 'testfile.txt'
                  }
                }
              ]
            }
          }
        }
      ]
    }
  }
}

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

const postMutationData = {
  data: {
    postMutation: returnTypeValue
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
      return postsWithFilesData.data.posts
    },
    postServiceInfo: (root, args, context, info) => {
      return returnTypeValue
    }
  },
  Mutation: {
    postMutation: () => {
      return returnTypeValue
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
  }
`

const postsWithFilesQuery = `
  query {
    posts {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
          files {
            pageInfo {
              hasNextPage
            }
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`

const postServiceInfoQuery = `
  query {
    postServiceInfo {
      someValue
    }
  }
`

const postMutation = `
  mutation {
    postMutation {
      someValue
    }
  }  
`

const commentSchema = `
    extend type Query {
      comments: CommentConnection!
      commentServiceInfo: SomeReturnType!
    }
    
    extend type Mutation {
      commentMutation: SomeReturnType!
    }
    
    type SomeReturnType {
      someValue: String!
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

const commentMutationData = {
  data: {
    commentMutation: returnTypeValue
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
    },
    commentServiceInfo: (root, args, context, info) => {
      return returnTypeValue
    }
  },
  Mutation: {
    commentMutation: () => {
      return returnTypeValue
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

const commentServiceInfoQuery = `
  query {
    commentServiceInfo {
      someValue
    }
  }
`

const commentMutation = `
  mutation {
    commentMutation {
      someValue
    }
  }  
`

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

test('Should be able to mutate with value types', async (t) => {
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
      query: userMutation
    })
  })

  t.same(usersRes.json(), userMutationData)

  const postsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: postMutation
    })
  })

  t.same(postsRes.json(), postMutationData)

  const commentsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: commentMutation
    })
  })

  t.same(commentsRes.json(), commentMutationData)
})

test('Should be able to query top-level with value types', async (t) => {
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
      query: userServiceInfoQuery
    })
  })

  t.same(usersRes.json(), {
    data: {
      userServiceInfo: returnTypeValue
    }
  })

  const postsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: postServiceInfoQuery
    })
  })

  t.same(postsRes.json(), {
    data: {
      postServiceInfo: returnTypeValue
    }
  })

  const commentsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: commentServiceInfoQuery
    })
  })

  t.same(commentsRes.json(), {
    data: {
      commentServiceInfo: returnTypeValue
    }
  })
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
      name: String!
    }
  `, {})

  const [userServiceB, userServicePortB] = await createService(t, `
    extend type Query {
        user: User!
    }
   
    type User @key(fields: "id") {
      id: ID!
      name: String!
    }
  `, {
    Query: {
      user: () => {
        return { id: '1', name: 'Test' }
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
            name
          }
        }`
    })
  })

  t.same(usersRes.json(), {
    data: {
      user: {
        id: '1',
        name: 'Test'
      }
    }
  })
})

test('Should be able to query nested value types', async (t) => {
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
      query: usersWithFilesQuery
    })
  })

  t.same(usersRes.json(), usersWithFilesData)

  const postsRes = await gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query: postsWithFilesQuery
    })
  })

  t.same(postsRes.json(), postsWithFilesData)
})
