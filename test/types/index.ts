import { expectAssignable, expectError } from 'tsd'
/* eslint-disable no-unused-expressions */
import { EventEmitter } from 'events'
// eslint-disable-next-line no-unused-vars
import Fastify, { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify'
// eslint-disable-next-line no-unused-vars
import { Readable } from 'stream'
// eslint-disable-next-line no-unused-vars
import mercurius, { MercuriusOptions, IResolvers, MercuriusContext, MercuriusServiceMetadata, MercuriusPlugin } from '../..'
// eslint-disable-next-line no-unused-vars
import { DocumentNode, ExecutionResult, GraphQLSchema, ValidationContext, ValidationRule } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { mapSchema } from '@graphql-tools/utils'
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

const resolvers: IResolvers = {
  Query: {
    add: async (_, { x, y }: { x: number, y: number }, ctx) => x + y
  }
}

// declare module 'mercurius' {
declare module '../../' {
  interface MercuriusContext { // eslint-disable-line
    request: FastifyRequest
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  loaders: {},
  ide: false,
  jit: 1,
  routes: true,
  prefix: '/prefix',
  defineMutation: false,
  errorHandler: true,
  errorFormatter: (result, context) => {
    context.reply
    result.data
    result.errors?.forEach((e) => e.message)
    return { statusCode: 200, response: result }
  },
  queryDepth: 8,
  cache: true,
  context: (request) => {
    return {
      request
    }
  },
  schemaTransforms: (schema) => schema
})

app.register(mercurius, {
  schema,
  resolvers,
  loaders: {},
  ide: false,
  jit: 1,
  routes: true,
  prefix: '/prefix',
  defineMutation: false,
  errorHandler: async function (err, request, reply) {
    reply.send({ errors: err.errors })
  },
  errorFormatter: (result, context) => {
    context.reply
    result.data
    result.errors?.forEach((e) => e.message)
    return { statusCode: 200, response: result }
  },
  queryDepth: 8,
  cache: true,
  context: (request) => {
    return {
      request
    }
  },
  schemaTransforms: (schema) => schema
})

app.register(mercurius, {
  schema,
  errorFormatter: mercurius.defaultErrorFormatter,
  schemaTransforms: [(schema) => schema],
  resolvers: {
    Query: {
      dogs (_root, _params, ctx, info) {
        info.parentType
        info.mergeInfo
        ctx.reply
        return dogs
      }
    },
    Mutation: {
      addDog (_root, { name, breed }: { name: string; breed?:string }, ctx) {
        ctx.pubsub.publish({
          topic: 'new_dog',
          payload: {
            newDogs: {
              name,
              breed
            }
          }
        })
      }
    },
    Subscription: {
      newDogs: {
        subscribe (_root, _params, ctx) {
          return ctx.pubsub.subscribe('new_dog')
        }
      },
      newRetrieverDogs: {
        subscribe: mercurius.withFilter<{
          name: string
          breed?: string
        }>(
          (_root, _args, { pubsub }) => {
            return pubsub.subscribe('new_dog')
          },
          (payload) => {
            return payload.breed === 'retriever'
          }
        )
      }
    }
  },
  subscription: true
})

// all params are optional
const opts: MercuriusOptions = {}
app.register(mercurius, opts)

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
      dogs (_root, _params, ctx) {
        ctx.request
        ctx.reply
        ctx.pubsub
        ctx.app

        return dogs
      }
    }
  })
  app.graphql.defineLoaders({
    Dog: {
      owner: async (queries: Array<{ obj: { name: keyof typeof owners }, params: {a: string} }>, _ctx) => {
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
  return await reply.graphql(query)
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
makeGraphqlServer({
  schema,
  resolvers,
  validationRules: ({
    variables,
    operationName,
    source
  }) => [customValidationRule]
})
makeGraphqlServer({ schema, errorFormatter: mercurius.defaultErrorFormatter })
makeGraphqlServer({ schema: mercurius.buildFederationSchema(schema) })
makeGraphqlServer({ schema: [schema, 'extend type Query { foo: String }'] })

// Gateway mode

const gateway = Fastify()

gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        schema: `
        type Query {
          dogs: [Dog]
        }`,
        connections: 10,
        initHeaders: {
          authorization: 'bearer supersecret'
        },
        keepAliveMaxTimeout: 10000,
        mandatory: true,
        rejectUnauthorized: true,
        rewriteHeaders: (headers, context) => {
          expectAssignable<MercuriusContext>(context)
          return {
            authorization: headers.authorization
          }
        },
        wsUrl: 'ws://localhost:4001/graphql',
        wsConnectionParams: {
          connectionCallback: () => {},
          connectionInitPayload: {
            authorization: 'bearer supersecret'
          },
          failedConnectionCallback: (err) => {
            err.message
          },
          failedReconnectCallback: () => {},
          maxReconnectAttempts: 10,
          reconnect: true,
          rewriteConnectionInitPayload: (payload, context) => {
            expectAssignable<MercuriusContext>(context)
            return {}
          }
        }
      },
      {
        name: 'post',
        url: 'http://localhost:4002/graphql',
        wsConnectionParams: async () => {
          return {
            connectionCallback: () => {},
            connectionInitPayload: {
              authorization: 'bearer supersecret'
            },
            failedConnectionCallback: (err) => {
              err.message
            },
            failedReconnectCallback: () => {},
            maxReconnectAttempts: 10,
            reconnect: true,
            rewriteConnectionInitPayload: (payload, context) => {
              expectAssignable<MercuriusContext>(context)
              return {}
            }
          }
        }
      }
    ]
  }
})

// Async rewriteHeaders
gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        schema: `
        type Query {
          dogs: [Dog]
        }`,
        keepAlive: 3000,
        rewriteHeaders: async (headers, context) => {
          const sessionId = await Promise.resolve('12')
          return {
            sessionId
          }
        }
      }
    ]
  }
})

// keepAlive value in service config
gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        schema: `
        type Query {
          dogs: [Dog]
        }`,
        keepAlive: 3000
      }
    ]
  }
})

gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        schema: `
        type Query {
          dogs: [Dog]
        }`,
        setResponseHeaders: (reply) => reply.header('abc', 'abc')
      }
    ]
  }
})

expectError(() => gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        schema: `
        type Query {
          dogs: [Dog]
        }`,
        setResponseHeaders: false
      }
    ]
  }
}))

expectError(() => gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        schema: `
        type Query {
          dogs: [Dog]
        }`,
        keepAlive: true
      }
    ]
  }
}))

expectError(() => gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql',
        schema: `
        type Query {
          dogs: [Dog]
        }`,
        keepAlive: 'yes'
      }
    ]
  }
}))

// Gateway mode with load balanced services
gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: ['http://localhost:4001/graphql', 'http://localhost:4002/graphql']
      },
      {
        name: 'post',
        url: 'http://localhost:4003/graphql'
      }
    ]
  }
})

// Gateway mode with custom services retry props
gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql'
      }
    ],
    retryServicesCount: 30,
    retryServicesInterval: 5000
  }
})

expectError(() => gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'user',
        url: 'http://localhost:4001/graphql'
      }
    ],
    retryServicesCount: '30',
    retryServicesInterval: '5000'
  }
}))

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
  schema,
  resolvers,
  subscription: true
})

const emitter = mq()

app.register(mercurius, {
  schema,
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
    },
    onDisconnect: (context) => {
      context.app.graphql
      context.pubsub.publish({
        topic: 'topic',
        payload: 'payload'
      })
      context.reply.headers
      context.request.ip
    }
  }
})

app.register(mercurius, {
  schema,
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
  schema,
  resolvers,
  subscription: {
    emitter
  }
})

app.register(mercurius, {
  schema,
  resolvers,
  subscription: {
    fullWsTransport: true
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

app
  .graphql(
    `
query hello {
  helloWorld
}
`,
    {},
    {
      foo: 'bar'
    },
    'hello'
  )
  .then((response) => {
    response.data
    response.errors
  })
  .catch((reason) => {
    reason
  })

app.graphql.pubsub.publish({
  topic: 'topic',
  payload: 'payload'
})

async () => {
  const subscription = await app.graphql.pubsub.subscribe<{ newNotification: string }>('topic')

  subscription.on('data', (chunk) => {
    console.log(chunk)
  })

  for await (const data of subscription) {
    console.log(data.newNotification)
  }
}

app.graphql.transformSchema([(schema) => schema])

app.graphql.transformSchema(schema => schema)

class CustomPubSub {
  emitter: EventEmitter

  constructor () {
    this.emitter = new EventEmitter()
  }

  // typed based on the PubSub implementation
  async subscribe (topic: string, queue: Readable & { close: () => void }): Promise<void> {
    const listener = (payload: any) => {
      queue.push(payload)
    }

    const close = () => {
      this.emitter.removeListener(topic, listener)
    }

    this.emitter.on(topic, listener)
    queue.close = close
  }

  publish (event: { topic: string, payload: any }, callback: () => void) {
    this.emitter.emit(event.topic, event.payload)
    callback()
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: {
    pubsub: new CustomPubSub()
  }
})

app.graphql.gateway.refresh()

app.graphql.gateway.serviceMap.serviceName.setSchema(`
query hello {
  helloWorld
}
`)

app.graphql.addHook('preParsing', async function (schema, source, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<string>(source)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preValidation', async function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preExecution', async function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
  return {
    schema,
    document,
    errors: [
      new Error('foo')
    ]
  }
})

app.graphql.addHook('preGatewayExecution', async function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
  return {
    document,
    errors: [
      new Error('foo')
    ]
  }
})

// GraphQL Request lifecycle hooks
app.graphql.addHook('onResolution', async function (execution, context) {
  expectAssignable<ExecutionResult>(execution)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preSubscriptionParsing', async function (schema, source, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<string>(source)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preSubscriptionExecution', async function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preGatewaySubscriptionExecution', async function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('onSubscriptionResolution', async function (execution, context) {
  expectAssignable<ExecutionResult>(execution)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('onSubscriptionEnd', async function (context) {
  expectAssignable<MercuriusContext>(context)
})

// Hooks containing service metadata
app.graphql.addHook('preGatewayExecution', async function (schema, document, context, service) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
  expectAssignable<MercuriusServiceMetadata>(service)
})

app.graphql.addHook('preGatewaySubscriptionExecution', async function (schema, document, context, service) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
  expectAssignable<MercuriusServiceMetadata>(service)
})

// GraphQL Application lifecycle hooks
app.graphql.addHook('onGatewayReplaceSchema', async function (instance, schema) {
  expectAssignable<FastifyInstance>(instance)
  expectAssignable<GraphQLSchema>(schema)
})

expectError(() => {
  return new mercurius.ErrorWithProps('mess', {}, 'wrong statusCode')
})

expectAssignable<Error>(new mercurius.ErrorWithProps('mess', {}, 200))

expectError(() => {
  app.register(mercurius, {
    graphiql: 'nonexistent'
  })
})

declare module 'fastify' {
// eslint-disable-next-line no-unused-vars
  interface FastifyInstance {
    graphql: MercuriusPlugin
  }
}

mercurius.defaultErrorFormatter({}, {} as MercuriusContext)

mercurius.defaultErrorFormatter(new Error('test error'), {} as MercuriusContext)

expectError(() => {
  return mercurius.defaultErrorFormatter({}, null)
})

expectError(() => {
  return mercurius.defaultErrorFormatter({}, undefined)
})
