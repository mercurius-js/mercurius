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
  },
  p3: {
    pid: 'p3',
    title: 'Post 3',
    content: 'Content 3',
    authorId: 'u2'
  }
}

test('gateway handles @requires directive correctly', async (t) => {
  const userServicePort = await createService(t, `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
      name: String!
      fullName: String
      avatar(size: AvatarSize!): String
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

  const biographyServicePort = await createService(t, `
    type User @key(fields: "id") @extends {
      id: ID! @external
      name: String @external
      biography: String @requires(fields: "id name")
    }
  `, {
    User: {
      biography (user) {
        const numberOfPosts = Object.values(posts).filter(p => p.authorId === user.id).length
        return `${user.name} has ${numberOfPosts} ${numberOfPosts === 1 ? 'post' : 'posts'}`
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
        name: 'post',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'rating',
        url: `http://localhost:${biographyServicePort}/graphql`
      }]
    }
  })

  await gateway.listen(0)

  const query = `
    query {
      me {
        friends {
          avatar(size:small)
          biography
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

  t.deepEqual(JSON.parse(res.body), {
    data: {
      me: {
        friends: [
          {
            avatar: 'avatar-small.jpg',
            biography: 'Jane has 2 posts'
          }
        ]
      }
    }
  })
})
