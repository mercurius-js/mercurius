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
  await service.listen({ port: 0 })

  return [service, service.server.address().port]
}

const users = {
  u1: {
    id: 'u1',
    name: 'Marie Curie',
    fields: ['Physics', 'Chemistry']
  },
  u2: {
    id: 'u2',
    name: 'ALbert Einstein',
    fields: ['Physics', 'Philosophy']
  }
}

const messages = {
  m1: {
    id: 'm1',
    message: 'Text Message.',
    recipients: [{ id: 'u1' }]
  },
  m2: {
    id: 'm2',
    header: 'Email Header',
    message: 'Email Message.',
    recipients: [{ id: 'u2' }]
  }
}

test('gateway handles reference types in unions at the same schema paths correctly', async (t) => {
  t.plan(2)

  const [messageService, messageServicePort] = await createService(
    `
    type Query @extends {
      getMessages: [Message!]!
    }

    union Message = EmailMessage | TextMessage

    type TextMessage {
      id: ID!
      message: String!
      recipients: [TextMessageUser!]!
    }

    type EmailMessage {
      id: ID!
      message: String!
      header: String!
      recipients: [EmailMessageUser!]!
    }

    type TextMessageUser @extends @key(fields: "id") {
      id: ID! @external
    }

    type EmailMessageUser @extends @key(fields: "id") {
      id: ID! @external
    }
  `,
    {
      Query: {
        getMessages: () => {
          return Object.values(messages)
        }
      },
      Message: {
        resolveType: (message) => {
          if ('header' in message) {
            return 'EmailMessage'
          }
          return 'TextMessage'
        }
      }
    }
  )

  const [userService, userServicePort] = await createService(
    `
    type TextMessageUser @key(fields: "id") {
      id: ID!
      name: String!
      fields: [String!]!
    }

    type EmailMessageUser @key(fields: "id") {
      id: ID!
      name: String!
      fields: [String!]!
    }
  `,
    {
      TextMessageUser: {
        __resolveReference: (user) => {
          return users[user.id]
        }
      },
      EmailMessageUser: {
        __resolveReference: (user) => {
          return users[user.id]
        }
      }
    }
  )

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await messageService.close()
    await userService.close()
  })
  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'message',
          url: `http://localhost:${messageServicePort}/graphql`
        },
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ]
    }
  })

  const query = `
    query {
      getMessages {
        ... on TextMessage {
          id
          message
          recipients {
            id
            name
            fields
          }
        }
        ... on EmailMessage {
          id
          header
          message
          recipients {
            id
            name
            fields
          }
        }
      }
    }
  `

  // Not cached
  {
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
        getMessages: [
          {
            id: 'm1',
            message: 'Text Message.',
            recipients: [
              {
                id: 'u1',
                name: 'Marie Curie',
                fields: ['Physics', 'Chemistry']
              }
            ]
          },
          {
            id: 'm2',
            header: 'Email Header',
            message: 'Email Message.',
            recipients: [
              {
                id: 'u2',
                name: 'ALbert Einstein',
                fields: ['Physics', 'Philosophy']
              }
            ]
          }
        ]
      }
    })
  }

  // Cached
  {
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
        getMessages: [
          {
            id: 'm1',
            message: 'Text Message.',
            recipients: [
              {
                id: 'u1',
                name: 'Marie Curie',
                fields: ['Physics', 'Chemistry']
              }
            ]
          },
          {
            id: 'm2',
            header: 'Email Header',
            message: 'Email Message.',
            recipients: [
              {
                id: 'u2',
                name: 'ALbert Einstein',
                fields: ['Physics', 'Philosophy']
              }
            ]
          }
        ]
      }
    })
  }
})
