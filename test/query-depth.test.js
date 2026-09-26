'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const WebSocket = require('ws')
const { once } = require('events')
const { parse } = require('graphql')
const GQL = require('..')
const calculateQueryDepth = require('../lib/queryDepth')
const { MER_ERR_GQL_VALIDATION, MER_ERR_GQL_QUERY_DEPTH } = require('../lib/errors')

const dogs = [{
  name: 'Max',
  owner: 'Jennifer',
  breed: 'Labrador'
}, {
  name: 'Charlie',
  owner: 'Sarah',
  breed: 'Labradoodle'
}, {
  name: 'Buddy',
  owner: 'Tracy',
  breed: 'Labrasatian'
}]

const owners = [
  {
    name: 'Jennifer',
    pet: 'Max'
  },
  {
    name: 'Sarah',
    pet: 'Charlie'
  },
  {
    name: 'Tracy',
    pet: 'Buddy'
  }
]

const schema = `
  type Human {
    name: String!
    pet: Dog
  }

  type Dog {
    name: String!
    owner: Human
  }

  type Query {
    dogs: [Dog]
  }
`

const resolvers = {
  Human: {
    pet (human, params, { reply }) {
      return dogs.find(dog => dog.name === human.pet)
    }
  },
  Dog: {
    owner (dog, params, { reply }) {
      return owners.find(owner => owner.pet === dog.name)
    }
  },
  Query: {
    dogs (_, params, { reply }) {
      return dogs
    }
  }
}

const query = `{
  dogs {
    name
    owner {
      name
      pet {
        name
        owner {
          name
          pet {
            name
          }
        }
      }
    }
  }
}`

const goodResponse = {
  data: {
    dogs: [
      {
        name: 'Max',
        owner: {
          name: 'Jennifer',
          pet: {
            name: 'Max',
            owner: {
              name: 'Jennifer',
              pet: {
                name: 'Max'
              }
            }
          }
        }
      },
      {
        name: 'Charlie',
        owner: {
          name: 'Sarah',
          pet: {
            name: 'Charlie',
            owner: {
              name: 'Sarah',
              pet: {
                name: 'Charlie'
              }
            }
          }
        }
      },
      {
        name: 'Buddy',
        owner: {
          name: 'Tracy',
          pet: {
            name: 'Buddy',
            owner: {
              name: 'Tracy',
              pet: {
                name: 'Buddy'
              }
            }
          }
        }
      }
    ]
  }
}

test('queryDepth - test total depth is within queryDepth parameter', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    queryDepth: 6
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)

  t.assert.deepEqual(res, goodResponse)
})

test('queryDepth - test total depth is over queryDepth parameter', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    queryDepth: 5
  })

  // needed so that graphql is defined
  await app.ready()

  const err = new MER_ERR_GQL_VALIDATION()
  const queryDepthError = new MER_ERR_GQL_QUERY_DEPTH('unnamedQuery', 6, 5)
  err.errors = [queryDepthError]

  await t.assert.rejects(app.graphql(query), err)
})

test('queryDepth - reject named fragment over queryDepth parameter', async (t) => {
  const app = Fastify()
  app.register(GQL, {
    schema,
    resolvers,
    queryDepth: 5
  })

  await app.ready()

  const fragmentQuery = `query QueryName {
    dogs {
      ...DeepDog
    }
  }

  fragment DeepDog on Dog {
    owner {
      pet {
        owner {
          pet {
            name
          }
        }
      }
    }
  }`
  const err = new MER_ERR_GQL_VALIDATION()
  err.errors = [new MER_ERR_GQL_QUERY_DEPTH('QueryName', 6, 5)]

  await t.assert.rejects(app.graphql(fragmentQuery), err)
})

test('queryDepth - queryDepth is not number', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    queryDepth: '6'
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)

  t.assert.deepEqual(res, goodResponse)
})

test('queryDepth - definition.kind and definition.name change', async (t) => {
  const app = Fastify()
  const localQuery = `query QueryName {
    dogs {
      name
      owner {
        ...OwnerName
        pet {
          name
          owner {
            ...OwnerName
            pet {
              name
            }
          }
        }
      }
    }
  }

  fragment OwnerName on Human {
    name
  }`

  app.register(GQL, {
    schema,
    resolvers,
    queryDepth: 6
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(localQuery)

  t.assert.deepEqual(res, goodResponse)
})

test('queryDepth - named fragment spreads have the same depth as inline selections', (t) => {
  const inlineDocument = parse(`
    query QueryName {
      dogs {
        owner {
          pet {
            owner {
              pet {
                name
              }
            }
          }
        }
      }
    }
  `)
  const fragmentDocument = parse(`
    query QueryName {
      dogs {
        ...DeepDog
      }
    }

    fragment DeepDog on Dog {
      owner {
        pet {
          owner {
            pet {
              name
            }
          }
        }
      }
    }
  `)

  const inlineErrors = calculateQueryDepth(inlineDocument.definitions, 5)
  const fragmentErrors = calculateQueryDepth(fragmentDocument.definitions, 5)

  t.assert.deepEqual(fragmentErrors.map(error => error.message), inlineErrors.map(error => error.message))
  t.assert.deepEqual(calculateQueryDepth(fragmentDocument.definitions, 6), [])
})

test('queryDepth - handles unknown and cyclic fragment spreads', (t) => {
  const unknownFragment = parse('query QueryName { dogs { ...Unknown } }')
  t.assert.deepEqual(calculateQueryDepth(unknownFragment.definitions, 1), [])

  const cyclicFragments = parse(`
    query QueryName {
      dogs {
        ...DogFields
      }
    }

    fragment DogFields on Dog {
      owner {
        ...OwnerFields
      }
    }

    fragment OwnerFields on Human {
      pet {
        ...DogFields
      }
    }
  `)
  t.assert.strictEqual(calculateQueryDepth(cyclicFragments.definitions, 100).length, 1)
})

test('queryDepth - handles long fragment chains without recursive traversal', (t) => {
  const fragments = []
  for (let i = 0; i < 5000; i++) {
    const selection = i === 4999 ? 'name' : `...Fragment${i + 1} ...Fragment${i + 1}`
    fragments.push(`fragment Fragment${i} on Dog { ${selection} }`)
  }

  const document = parse(`query QueryName { dogs { ...Fragment0 } } ${fragments.join('\n')}`)
  t.assert.deepEqual(calculateQueryDepth(document.definitions, 2), [])

  fragments[4999] = 'fragment Fragment4999 on Dog { ...Fragment0 }'
  const cyclicDocument = parse(`query QueryName { dogs { ...Fragment0 } } ${fragments.join('\n')}`)
  t.assert.strictEqual(calculateQueryDepth(cyclicDocument.definitions, 100).length, 1)
})

test('queryDepth - ensure query depth is correctly calculated', async (t) => {
  const schema = `
  type Nutrition {
      flavorId: ID
      calories: Int
      fat: Int
      sodium: Int,
      description: NutritionDescription
    }

  type NutritionDescription {
    body: String
    other: AnotherType
  }
  type AnotherType {
    body: String
  }

  type Recipe {
    name: String
    ingredients: [Ingredient]
  }

  type Ingredient {
    name: String,
  }
  type Flavor {
    id: ID
    name: String
    description: String
    nutrition: Nutrition
    recipes: [Recipe]
    seasons: [Season]
  }

  type Season {
    name: String
  }
  type Query {
    flavors: [Flavor],
    otherFlavors: [Flavor]
  }
`
  const resolvers = {
    Query: {
      otherFlavors (params, { reply }) {
        return [
          {
            id: 2,
            name: 'Blueberry',
            seasons: [
              { name: 'Spring' },
              { name: 'Fall' }
            ]
          },
          {
            id: 3,
            name: 'Blackberry',
            seasons: [
              { name: 'Winter' }
            ]
          }
        ]
      },
      flavors (params, { reply }) {
        return [
          {
            id: 1,
            name: 'Strawberry',
            description: 'Lorem ipsum',
            seasons: [
              { name: 'Spring' },
              { name: 'Summer' }
            ]
          }
        ]
      }
    },
    Flavor: {
      nutrition (params) {
        return {
          flavorId: 1,
          calories: 123,
          sodium: 10,
          fat: 1
        }
      },
      recipes (params) {
        return [
          { name: 'Strawberry Cake' },
          { name: 'Strawberry Ice Cream' }
        ]
      }
    },
    Recipe: {
      ingredients (params) {
        return [
          { name: 'milk' },
          { name: 'sugar' },
          { name: 'butter' }
        ]
      }
    },
    Nutrition: {
      description (params) {
        return {
          body: 'lorem ipsum'
        }
      }
    },
    NutritionDescription: {
      other (params) {
        return {
          body: 'another string'
        }
      }
    }
  }

  const query = `{
    flavors {
      id
      name
      description
      nutrition {
        calories,
        description {
          body
          other {
            body
          }
        }
      }
      recipes {
        name
        ingredients {
          name
        }
      }
      seasons {
        name
      }
    }
  }`
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers,
    queryDepth: 5
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)
  t.assert.deepEqual(res, {
    data: {
      flavors: [
        {
          id: '1',
          name: 'Strawberry',
          description: 'Lorem ipsum',
          nutrition: {
            calories: 123,
            description: {
              body: 'lorem ipsum',
              other: {
                body: 'another string'
              }
            }
          },
          recipes: [
            {
              name: 'Strawberry Cake',
              ingredients: [
                { name: 'milk' },
                { name: 'sugar' },
                { name: 'butter' }
              ]
            },
            {
              name: 'Strawberry Ice Cream',
              ingredients: [
                { name: 'milk' },
                { name: 'sugar' },
                { name: 'butter' }
              ]
            }
          ],
          seasons: [
            { name: 'Spring' },
            { name: 'Summer' }
          ]
        }
      ]
    }
  })
})

test('queryDepth - enforce depth limit for subscriptions over websocket', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  const schema = `
    type Human {
      name: String!
      pet: Dog
    }

    type Dog {
      name: String!
      owner: Human
    }

    type Query {
      ping: String
    }

    type Subscription {
      dogUpdated: Dog
    }
  `

  const resolvers = {
    Query: {
      ping: () => 'pong'
    },
    Subscription: {
      dogUpdated: {
        subscribe: async (root, args, ctx) => ctx.pubsub.subscribe('DOG_UPDATED')
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    subscription: true,
    queryDepth: 5
  })

  await app.listen({ port: 0 })

  const ws = new WebSocket(`ws://localhost:${app.server.address().port}/graphql`, 'graphql-ws')
  t.after(() => ws.close())

  await once(ws, 'open')

  const waitForMessageType = async (expectedType) => {
    while (true) {
      const [data] = await once(ws, 'message')
      const message = JSON.parse(data.toString())
      if (message.type === expectedType) {
        return message
      }
    }
  }

  ws.send(JSON.stringify({ type: 'connection_init' }))
  await waitForMessageType('connection_ack')

  ws.send(JSON.stringify({
    id: '1',
    type: 'start',
    payload: {
      query: `subscription {
        dogUpdated {
          owner {
            pet {
              owner {
                pet {
                  name
                }
              }
            }
          }
        }
      }`
    }
  }))

  const errorMessage = await waitForMessageType('error')

  t.assert.strictEqual(errorMessage.id, '1')
  t.assert.match(errorMessage.payload[0].message, /Graphql validation error/)

  ws.send(JSON.stringify({
    id: '2',
    type: 'start',
    payload: {
      query: `subscription {
        dogUpdated {
          ...DeepDog
        }
      }

      fragment DeepDog on Dog {
        owner {
          pet {
            owner {
              pet {
                name
              }
            }
          }
        }
      }`
    }
  }))

  const fragmentErrorMessage = await waitForMessageType('error')

  t.assert.strictEqual(fragmentErrorMessage.id, '2')
  t.assert.match(fragmentErrorMessage.payload[0].message, /Graphql validation error/)
})
