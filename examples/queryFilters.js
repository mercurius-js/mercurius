'use strict'

const Fastify = require('fastify')
const GQL = require('..')
const app = Fastify()

const gql = require('graphql-tag')

const basicQuery = gql`
query {
  dogs(limit:4) {
     name
  mother{
     name 
  }
  }
}
`

const dogs = [{
  name: 'Max',
  type: 'Husky'
}, {
  name: 'Charlie',
  type: 'Husky'
}, {
  name: 'Buddy',
  type: 'Husky'
}, {
  name: 'Max',
  type: 'Husky'
}]

const schema = `
  type Dog {
    name: String!
    type: String
    mother: Dog
  }

  type Query {
    dogs(limit: Int): [Dog]
  }
`

// Helper to filter data
var pick = function (obj, props) {
  'use strict'

  // Make sure object and properties are provided
  if (!obj || !props) return

  // Create new object
  var picked = {}

  // Loop through props and push to new object
  props.forEach(function (prop) {
    picked[prop] = obj[prop]
  })

  // Return new object
  return picked
}

const resolvers = {
  Query: {
    dogs (_, params, context, info) {
      const queryData = context.buildQueryObject(info)
      console.log(basicQuery)
      // Example database queries
      console.log(`SQL ROOT QUERY: select ${queryData.getRootFields()} from Dog`)
      if (queryData.hasRelation('mother')) {
        console.log(`SQL RELATION QUERY: select ${queryData.getRelationFields('mother')} from DoggyParents`)
      }
      // Execute without database
      const newDogs = []
      for (const dog of dogs) {
        newDogs.push(pick(dog, queryData.fields))
      }
      return newDogs
    }
  }
}

app.register(GQL, {
  schema,
  resolvers,
  graphiql: true,
  queryFilters: true
})

app.listen(3000)
