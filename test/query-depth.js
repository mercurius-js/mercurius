'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')
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

  t.same(res, goodResponse)
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

  await t.rejects(app.graphql(query), err)
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

  t.same(res, goodResponse)
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

  t.same(res, goodResponse)
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
  t.same(res, {
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
