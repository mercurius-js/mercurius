'use strict'

const Fastify = require('fastify')
const mercurius = require('..')

async function start () {
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
    graphiql: true
  })

  await app.ready()

  app.graphql.addHook('preParsing', async function (schema, source, context) {
    console.log('preParsing called')
  })

  app.graphql.addHook('preValidation', async function (schema, document, context) {
    console.log('preValidation called')
  })

  app.graphql.addHook('preExecution', async function (schema, document, context) {
    console.log('preExecution called')
    return {
      document,
      errors: [
        new Error('foo')
      ]
    }
  })

  app.graphql.addHook('onResolution', async function (execution, context) {
    console.log('onResolution called')
  })

  app.get('/', async function (req, reply) {
    const query = '{ add(x: 2, y: 2) }'

    return reply.graphql(query)
  })

  app.listen({ port: 3000 })
}

start()
