/* eslint-disable no-unused-expressions */

import Fastify from 'fastify'
// eslint-disable-next-line no-unused-vars
import mercurius, { MercuriusOptions } from '../..'
// eslint-disable-next-line no-unused-vars
import { ValidationContext, ValidationRule } from 'graphql'
import { makeExecutableSchema, mapSchema } from 'graphql-tools'
import mq from 'mqemitter'

const app = Fastify()

const dogs = [{
  name: 'Max'
}, {
  name: 'Charlie'
}, {
  name: 'Buddy'
}, {
  name: 'Max'
}]

const owners = {
  Max: {
    name: 'Jennifer'
  },
  Charlie: {
    name: 'Sarah'
  },
  Buddy: {
    name: 'Tracy'
  }
}

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_: any, { x, y }: { x: number, y: number }) => x + y
  }
}

app.register(mercurius, {
  schema: schema,
  resolvers,
  loaders: {},
  ide: false,
  jit: 1,
  routes: true,
  prefix: '/prefix',
  defineMutation: false,
  errorHandler: true,
  errorFormatter: (result, context) => {
    result.data
    result.errors?.forEach(e => e.message)
    return { statusCode: 200, response: result }
  },
  queryDepth: 8,
  cache: true
})

app.register(mercurius, {
  schema,
  errorFormatter: mercurius.defaultErrorFormatter
})

app.register(async function (app) {
  app.graphql.extendSchema(`
    type Human {
      name: String!
    }

    type Dog {
      name: String!
      owner: Human
    }

    type Query {
      dogs: [Dog]
    }
  `)
  app.graphql.defineResolvers({
    Query: {
      dogs (_, params, { reply }) {
        return dogs
      }
    }
  })
  app.graphql.defineLoaders({
    Dog: {
      async owner (queries: Array<{ obj: { name: keyof typeof owners } }>) {
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  })
})

app.register(async function (app) {
  app.graphql.extendSchema(`
    type Query {
      willThrow: String
    }
  `)
  app.graphql.defineResolvers({
    Query: {
      willThrow: async () => { throw new mercurius.ErrorWithProps('Extended Error', { code: 'EXTENDED_ERROR', reason: 'some reason', other: 32 }) }
    }
  })
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.listen(3000)

function makeGraphqlServer (options: MercuriusOptions) {
  const app = Fastify()

  app.register(mercurius, options)

  return app
}

const customValidationRule: ValidationRule = (_context: ValidationContext) => {
  return {
    Document () {
      return false
    }
  }
}

makeGraphqlServer({ schema, resolvers })
makeGraphqlServer({ schema, resolvers, validationRules: [] })
makeGraphqlServer({ schema, resolvers, validationRules: [customValidationRule] })
makeGraphqlServer({ schema, resolvers, validationRules: ({ variables, operationName, source }: { source: string, variables?: Record<string, any>, operationName?: string }) => [customValidationRule] })
makeGraphqlServer({ schema, errorFormatter: mercurius.defaultErrorFormatter })
makeGraphqlServer({ schema: mercurius.buildFederationSchema(schema) })

// Gateway mode

const gateway = Fastify()

gateway.register(mercurius, {
  gateway: {
    services: [{
      name: 'user',
      url: 'http://localhost:4001/graphql'

    }, {
      name: 'post',
      url: 'http://localhost:4002/graphql'
    }]
  }
})

// Executable schema

const executableSchema = makeExecutableSchema({
  typeDefs: [],
  resolvers: []
})

gateway.register(mercurius, {
  schema: executableSchema
})

// Subscriptions

app.register(mercurius, {
  schema: schema,
  resolvers,
  subscription: true
})

const emitter = mq()

app.register(mercurius, {
  schema: schema,
  resolvers,
  subscription: {
    emitter,
    verifyClient: (info, next) => {
      info.req.headers
      next(true)
      next(false)
    },
    context: (connection, request) => {
      connection.socket
      request.headers
      return {}
    },
    onConnect: (data) => {
      data.type
      data.payload
      return {}
    }
  }
})

app.register(mercurius, {
  schema: schema,
  resolvers,
  subscription: {
    context: async (connection, request) => {
      connection.socket
      request.headers
      return {}
    },
    onConnect: async (data) => {
      data.type
      data.payload
      return {}
    }
  }
})

app.register(mercurius, {
  schema: schema,
  resolvers,
  subscription: {
    emitter
  }
})

app.register(mercurius, {
  schema,
  resolvers,
  schemaTransforms: []
})

app.register(mercurius, {
  schema,
  resolvers,
  schemaTransforms: [(schema) => mapSchema(schema)]
})

app.register(mercurius, {
  schema,
  resolvers,
  schemaTransforms: (schema) => mapSchema(schema)
})
