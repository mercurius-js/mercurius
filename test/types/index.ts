import { expectAssignable, expectError, expectType } from 'tsd'
/* eslint-disable no-unused-expressions */
import { EventEmitter } from 'events'
// eslint-disable-next-line no-unused-vars
import Fastify, { FastifyRequest } from 'fastify'
// eslint-disable-next-line no-unused-vars
import { Readable } from 'stream'
// eslint-disable-next-line no-unused-vars
import * as mercuriusNamespaceImport from '../..'
import mercurius, {
  mercurius as mercuriusNamedImport,
  ErrorWithProps,
  defaultErrorFormatter,
  persistedQueryDefaults,
  withFilter,
  MercuriusOptions,
  IResolvers,
  MercuriusContext,
  MercuriusPlugin,
  MercuriusLoaders
} from '../..'
// eslint-disable-next-line no-unused-vars
import { DocumentNode, ExecutionResult, GraphQLSchema, ValidationContext, ValidationRule } from 'graphql'
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

expectType<typeof mercurius>(mercuriusNamedImport)
expectType<typeof mercurius>(mercuriusNamespaceImport.default)
expectType<typeof mercurius>(mercuriusNamespaceImport.mercurius)

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

app.listen({ port: 3000 })

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
makeGraphqlServer({ schema: [schema, 'extend type Query { foo: String }'] })
makeGraphqlServer({
  additionalRouteOptions: {
    constraints: {
      version: '1.2'
    }
  }
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
    onConnect: () => true
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

app.graphql.addHook('preParsing', async function (schema, source, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<string>(source)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preParsing', function (schema, source, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<string>(source)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preValidation', async function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preValidation', function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preExecution', async function (schema, document, context, variables) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
  expectAssignable<Record<string, any>>(context)
  return {
    schema,
    document,
    variables,
    errors: [
      new Error('foo')
    ]
  }
})

app.graphql.addHook('preExecution', function (schema, document, context, variables) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
  expectAssignable<Record<string, any>>(context)
  return {
    schema,
    document,
    variables,
    errors: [
      new Error('foo')
    ]
  }
})

app.graphql.addHook('preExecution', function (schema, document, context, variables) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
  expectAssignable<Record<string, any>>(context)
})

// GraphQL Request lifecycle hooks
app.graphql.addHook('onResolution', async function (execution, context) {
  expectAssignable<ExecutionResult>(execution)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('onResolution', function (execution, context) {
  expectAssignable<ExecutionResult>(execution)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preSubscriptionParsing', async function (schema, source, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<string>(source)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preSubscriptionParsing', function (schema, source, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<string>(source)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preSubscriptionExecution', async function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('preSubscriptionExecution', function (schema, document, context) {
  expectAssignable<GraphQLSchema>(schema)
  expectAssignable<DocumentNode>(document)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('onSubscriptionResolution', async function (execution, context) {
  expectAssignable<ExecutionResult>(execution)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('onSubscriptionResolution', function (execution, context) {
  expectAssignable<ExecutionResult>(execution)
  expectAssignable<MercuriusContext>(context)
})

app.graphql.addHook('onSubscriptionEnd', async function (context, id) {
  expectAssignable<MercuriusContext>(context)
  expectAssignable<string | number>(id)
})

app.graphql.addHook('onSubscriptionEnd', function (context, id) {
  expectAssignable<MercuriusContext>(context)
  expectAssignable<string | number>(id)
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

mercurius.defaultErrorFormatter({ errors: [] }, {} as MercuriusContext)

expectError(() => {
  return mercurius.defaultErrorFormatter({}, null)
})

expectError(() => {
  return mercurius.defaultErrorFormatter({}, undefined)
})

// Context contains correct information about (batched) query identity
app.graphql.addHook('onResolution', async function (_execution, context) {
  expectType<number | undefined>(context.operationId)
  expectType<number | undefined>(context.operationsCount)
  expectType<string>(context.__currentQuery)
})

// Test graphiql configuration using an object as params
app.register(mercurius, { schema, resolvers, graphiql: { plugins: [] } })

app.register(mercurius, { schema, resolvers, ide: { enabled: false } })

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: {
    enabled: true,
    plugins: [
      {
        fetcherWrapper: 'testFetchWrapper',
        umdUrl: 'http://some-url',
        props: { foo: 'bar' },
        name: 'pluginName'
      }
    ]
  }
})

expectError(() => {
  app.register(mercurius, {
    schema,
    resolvers,
    graphiql: {
      enabled: true,
      plugins: [
        {
          fetcherWrapper: 'testFetchWrapper',
          props: { foo: 'bar' }
        }
      ]
    }
  })
})

interface CustomLoaderContext {
  foo: string
}

expectAssignable<MercuriusLoaders<CustomLoaderContext>>({
  Query: {
    add: async (_queries, context) => {
      context.foo
      return []
    }
  }
})

expectType<typeof mercurius.ErrorWithProps>(ErrorWithProps)
expectType<typeof mercurius.defaultErrorFormatter>(defaultErrorFormatter)
expectType<typeof mercurius.persistedQueryDefaults>(persistedQueryDefaults)
expectType<typeof mercurius.withFilter>(withFilter)
