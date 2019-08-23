'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

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

test('queryDepth', async (t) => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    resolvers
  })

  // needed so that graphql is defined
  await app.ready()

  const res = await app.graphql(query)

  t.deepEqual(res, {
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
  })
})
