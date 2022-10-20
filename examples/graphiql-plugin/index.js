'use strict'

const Fastify = require('fastify')
const mercurius = require('../..')
const Static = require('@fastify/static')
const { join } = require('path')

const app = Fastify()

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: {
    plugins: [
      {
        name: 'samplePlugin',
        props: {},
        umdUrl: 'http://localhost:3000/graphiql/samplePlugin.js',
        fetcherWrapper: 'parseFetchResponse'
      }
    ]
  }
})

app.register(Static, {
  root: join(__dirname, './plugin'),
  wildcard: false,
  serve: false
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.get('/graphiql/samplePlugin.js', (req, reply) => {
  reply.sendFile('samplePlugin.js')
})

app.listen({ port: 3000 })
