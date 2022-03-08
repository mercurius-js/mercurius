const { test } = require('tap')
const Fastify = require('fastify')
const { MockAgent, setGlobalDispatcher } = require('undici')
const GQL = require('../..')

async function createTestGatewayServer (t, userServiceUrl, agent) {
  // User service
  const userServiceSchema = `
  type Query @extends {
    me: User
  }

  type Metadata {
    info: String!
  }

  type User @key(fields: "id") {
    id: ID!
    name: String!
    quote(input: String!): String!
    metadata(input: String!): Metadata!
  }`

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [{
        agent,
        name: 'user',
        schema: userServiceSchema,
        url: userServiceUrl
      }]
    }
  })

  return gateway
}

test('it returns result object with error for exceptions connecting to federated service', async (t) => {
  t.plan(1)
  const userServiceHost = 'http://127.0.0.1:3333'

  // Create mock undici agent and pool
  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  const mockPool = mockAgent.get(userServiceHost)

  // Expected error from query request
  const expectedErrorMessage = 'Request failed.'
  const expectedResult = {
    data: {
      user: null
    },
    errors: [{
      message: expectedErrorMessage
    }]
  }

  // Intercept calls to the federated GraphQL service
  mockPool.intercept({
    path: '/graphql',
    method: 'POST'
  }).replyWithError(new Error(expectedErrorMessage))

  // Create test gateway instance
  const gateway = await createTestGatewayServer(t, `${userServiceHost}/graphql`, mockPool)

  // GraphQL query to attempt
  const query = `
    query {
      user: me {
        id
        name
      }
    }`

  // Send the query
  const result = await gateway.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  // Clean up gateway instance
  await gateway.close()

  // Verify query responds correctly with the predefined error
  t.same(JSON.parse(result.body), expectedResult)
})
