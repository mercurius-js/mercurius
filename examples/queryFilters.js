'use strict'

const Fastify = require('fastify')
const GQL = require('..')

const app = Fastify()

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
  }

  type Query {
    dogs: [Dog]
  }
`

/**
 Example query
 query {
  dogs{
    name
  }
}
 */

// Helper to filter data
var pick = function (obj, props) {

  'use strict';

  // Make sure object and properties are provided
  if (!obj || !props) return;

  // Create new object
  var picked = {};

  // Loop through props and push to new object
  props.forEach(function (prop) {
    picked[prop] = obj[prop];
  });

  // Return new object
  return picked;

};

const resolvers = {
  Query: {
    dogs(_, params, { getQueryFields }, info) {
      const queriedFields = getQueryFields(info)
      console.log('queriedFields', queriedFields);
      const newDogs = [];
      for (const dog of dogs) {
        newDogs.push(pick(dog, queriedFields))
      }
      console.log(newDogs);
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