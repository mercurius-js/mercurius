'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

async function createService (schema, resolvers = {}) {
  const service = Fastify()
  service.register(GQL, {
    schema,
    resolvers,
    federationMetadata: true
  })
  await service.listen(0)

  return service
}

async function createGateway (...services) {
  const gateway = Fastify()
  const teardown = async () => {
    await gateway.close()
    for (const service of services) {
      await service.close()
    }
  }
  const servicesMap = services.map((service, i) => ({
    name: `service${i}`,
    url: `http://localhost:${service.server.address().port}/graphql`
  }))

  gateway.register(GQL, {
    gateway: {
      services: servicesMap
    }
  })

  await gateway.listen(0)
  return { gateway, teardown }
}

function gatewayRequest (gateway, query) {
  return gateway.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    url: '/graphql',
    body: JSON.stringify({
      query
    })
  })
}

test('gateway handles @requires directive correctly', async (t) => {
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

  const userService = await createService(`
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

  const biographyService = await createService(`
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

  const { gateway, teardown } = await createGateway(biographyService, userService)
  t.teardown(teardown)

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
  const res = await gatewayRequest(gateway, query)

  t.same(JSON.parse(res.body), {
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

test('gateway handles @requires directive correctly from different services', async (t) => {
  const regions = [{
    id: 1,
    city: 'London'
  }, {
    id: 2,
    city: 'Paris'
  }]

  const sizes = [{
    id: 1,
    cpus: 10,
    memory: 10
  }, {
    id: 2,
    cpus: 20,
    memory: 20
  }, {
    id: 3,
    cpus: 30,
    memory: 30
  }]

  const dictService = await createService(`
    type Size @key(fields: "id") {
      id: Int!
      cpus: Int!
      memory: Int!
    }

    type Region @key(fields: "id") {
      id: Int!
      city: String!
    }

    extend type Host @key(fields: "id") {
      id: Int! @external
      size: Int! @external
      region: Int! @external
      sizeData: Size! @requires(fields: "size")
      regionData: Region! @requires(fields: "region")
    }`, {
    Host: {
      regionData (host) {
        return host.region && regions.find(r => r.id === host.region)
      },
      sizeData (host) {
        return host.size && sizes.find(s => s.id === host.size)
      }
    }
  })

  const hosts = [{
    id: 1,
    name: 'test1',
    region: 1,
    size: 1
  }, {
    id: 1,
    name: 'test2',
    region: 2,
    size: 2
  }]

  const hostService = await createService(`
    extend type Query {
      hosts: [Host]
    }

    type Host @key(fields: "id") {
      id: Int!
      name: String!
      region: Int!
      size: Int!
    }`, {
    Query: {
      hosts (parent, args, context, info) {
        return hosts
      }
    }
  })

  const { gateway, teardown } = await createGateway(hostService, dictService)
  t.teardown(teardown)

  t.plan(2)

  t.test('should retrieve @requires fields from different services', async (t) => {
    const query = `
    query {
      hosts {
        name
        sizeData {
          cpus
        }
      }
    }`
    const res = await gatewayRequest(gateway, query)
    t.same(JSON.parse(res.body), {
      data: {
        hosts: [
          {
            name: 'test1',
            sizeData: {
              cpus: 10
            }
          },
          {
            name: 'test2',
            sizeData: {
              cpus: 20
            }
          }
        ]
      }
    })
  })

  t.test('should retrieve multiple @requires fields from different services', async (t) => {
    const query = `
    query {
      hosts {
        name
        sizeData {
          cpus
        },
        regionData {
          city
        }
      }
    }`
    const res = await gatewayRequest(gateway, query)
    t.same(JSON.parse(res.body), {
      data: {
        hosts: [
          {
            name: 'test1',
            sizeData: {
              cpus: 10
            },
            regionData: {
              city: 'London'
            }
          },
          {
            name: 'test2',
            sizeData: {
              cpus: 20
            },
            regionData: {
              city: 'Paris'
            }
          }
        ]
      }
    })
  })
})

test('gateway handles @requires directive correctly apart of other directives', async (t) => {
  const regions = [{
    id: 1,
    city: 'London'
  }, {
    id: 2,
    city: 'Paris'
  }]

  const sizes = [{
    id: 1,
    cpus: 10,
    memory: 10
  }, {
    id: 2,
    cpus: 20,
    memory: 20
  }, {
    id: 3,
    cpus: 30,
    memory: 30
  }]

  const dictService = await createService(`
    directive @custom on OBJECT | FIELD_DEFINITION

    type Size @key(fields: "id") {
      id: Int!
      cpus: Int!
      memory: Int!
    }

    type Region @key(fields: "id") {
      id: Int!
      city: String!
    }

    type Metadata @key(fields: "id") {
      id: Int!
      description: String!
    }

    extend type Host @key(fields: "id") {
      id: Int! @external
      size: Int! @external
      region: Int! @external
      metadata: Metadata @custom
      sizeData: Size! @requires(fields: "size")
      regionData: Region! @requires(fields: "region")
    }`, {
    Host: {
      regionData (host) {
        return host.region && regions.find(r => r.id === host.region)
      },
      sizeData (host) {
        return host.size && sizes.find(s => s.id === host.size)
      }
    }
  })

  const hosts = [{
    id: 1,
    name: 'test1',
    region: 1,
    size: 1
  }, {
    id: 1,
    name: 'test2',
    region: 2,
    size: 2
  }]

  const hostService = await createService(`
    extend type Query {
      hosts: [Host]
    }

    type Host @key(fields: "id") {
      id: Int!
      name: String!
      region: Int!
      size: Int!
    }`, {
    Query: {
      hosts (parent, args, context, info) {
        return hosts
      }
    }
  })

  const { gateway, teardown } = await createGateway(hostService, dictService)
  t.teardown(teardown)

  const query = `
    query {
      hosts {
        name
        sizeData {
          cpus
        }
        metadata {
          description
        }        
      }
    }`
  const res = await gatewayRequest(gateway, query)
  t.same(JSON.parse(res.body), {
    data: {
      hosts: [
        {
          name: 'test1',
          sizeData: {
            cpus: 10
          },
          metadata: null
        },
        {
          name: 'test2',
          sizeData: {
            cpus: 20
          },
          metadata: null
        }
      ]
    }
  })
})

test('gateway exposes @requires directive in list of directives', async (t) => {
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

  const userService = await createService(`
    extend type Query {
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

  const biographyService = await createService(`
    type User @key(fields: "id") @extends {
      id: ID! @external
      name: String @external
      biography: String @requires(fields: "id name")
    }
  `, {
    User: {
      biography (user) {
        return `${user.name} with id ${user.id} test biography`
      }
    }
  })

  const { gateway, teardown } = await createGateway(biographyService, userService)
  t.teardown(teardown)

  const query = `
    query IntrospectionQuery {
      __schema {
        directives {
          name
        }
      }
    } 
  `
  const res = await gatewayRequest(gateway, query)

  t.same(JSON.parse(res.body), {
    data: {
      __schema: {
        directives: [
          { name: 'include' },
          { name: 'skip' },
          { name: 'deprecated' },
          { name: 'specifiedBy' },
          { name: 'requires' }
        ]
      }
    }
  })
})
