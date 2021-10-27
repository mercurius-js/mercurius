'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const WebSocket = require('ws')
const mq = require('mqemitter')
const GQL = require('..')

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

  type Subscription {
    onPingDog: Dog
  }
`

const resolvers = {
  Query: {
    dogs (_, params, { reply }) {
      return dogs
    }
  }
}

const query = `{
  dogs {
    name,
    owner {
      name
    }
  }
}`

test('loaders create batching resolvers', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      async owner (queries, { reply }) {
        // note that the second entry for max is cached
        t.same(queries, [{
          obj: {
            name: 'Max'
          },
          params: {}
        }, {
          obj: {
            name: 'Charlie'
          },
          params: {}
        }, {
          obj: {
            name: 'Buddy'
          },
          params: {}
        }])
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('disable cache for each loader', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      owner: {
        async loader (queries, { reply }) {
          // note that the second entry for max is NOT cached
          t.same(queries, [{
            obj: {
              name: 'Max'
            },
            params: {}
          }, {
            obj: {
              name: 'Charlie'
            },
            params: {}
          }, {
            obj: {
              name: 'Buddy'
            },
            params: {}
          }, {
            obj: {
              name: 'Max'
            },
            params: {}
          }])
          return queries.map(({ obj }) => owners[obj.name])
        },
        opts: {
          cache: false
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('defineLoaders method, if factory exists', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      async owner (queries, { reply }) {
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })
  app.register(async function (app) {
    app.graphql.defineLoaders(loaders)
    app.graphql.defineLoaders(loaders)
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('support context in loader', async (t) => {
  const app = Fastify()

  const resolvers = {
    Query: {
      dogs: (_, params, context) => {
        return dogs
      }
    }
  }

  const loaders = {
    Dog: {
      async owner (queries, context) {
        t.equal(context.app, app)
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  // needed so that graphql is defined
  await app.ready()

  const query = 'query { dogs { name owner { name } } }'
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.same(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('rersolver unknown type', async t => {
  const app = Fastify()

  const resolvers = {
    test: 2
  }

  app.register(GQL, {
    resolvers
  })

  try {
    // needed so that graphql is defined
    await app.ready()
    app.graphql('query { test }')
  } catch (error) {
    t.equal(error.message, 'Invalid options: Cannot find type test')
  }
})

test('minJit is not a number, throw error', async t => {
  const app = Fastify()

  app.register(GQL, {
    jit: '0'
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Invalid options: the jit option must be a number')
  }
})

test('options cache is type = number', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: 256,
    schema
  })

  await app.ready()
})

test('options cache is boolean', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: true,
    schema
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Invalid options: Cache type is not supported')
  }
})

test('options cache is !number && !boolean', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: 'cache'
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Invalid options: Cache type is not supported')
  }
})

test('options cache is false and lruErrors exists', async t => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    cache: false
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql('{ dogs { name { owner } } }')
  } catch (error) {
    t.equal(error.message, 'Graphql validation error')
    t.end()
  }
})

test('reply is empty, throw error', async (t) => {
  const app = Fastify()

  const resolvers = {
    Query: {
      dogs: () => dogs
    }
  }

  const loaders = {
    Dog: {
      async owner (queries) {
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql(query)
  } catch (error) {
    t.equal(error.message, 'Internal Server Error')
    t.equal(error.errors.length, 4)
    t.equal(error.errors[0].message, 'loaders only work via reply.graphql()')
  }
})

test('throw when persistedQueries is empty but onlyPersisted is true', async t => {
  const app = Fastify()

  app.register(GQL, {
    onlyPersisted: true
  })

  t.rejects(app.ready(), 'onlyPersisted is true but there are no persistedQueries')
})

test('loaders support custom context', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      async owner (queries, { reply, test }) {
        t.equal(test, 'custom')
        // note that the second entry for max is cached
        t.same(queries, [{
          obj: {
            name: 'Max'
          },
          params: {}
        }, {
          obj: {
            name: 'Charlie'
          },
          params: {}
        }, {
          obj: {
            name: 'Buddy'
          },
          params: {}
        }])
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders,
    context: (request, reply) => {
      return {
        test: 'custom'
      }
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('subscriptions properly execute loaders', t => {
  const app = Fastify()
  const emitter = mq()
  t.teardown(() => app.close())

  app.register(GQL, {
    schema,
    resolvers: {
      Subscription: {
        onPingDog: {
          subscribe: (_, params, { pubsub }) => pubsub.subscribe('PINGED_DOG')
        }
      }
    },
    loaders: {
      Dog: {
        owner: async () => [owners[dogs[0].name]]
      }
    },
    subscription: {
      emitter
    }
  })

  app.listen(0, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (app.server.address()).port + '/graphql', 'graphql-ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
    t.teardown(client.destroy.bind(client))
    client.setEncoding('utf8')

    client.write(JSON.stringify({
      type: 'connection_init'
    }))

    client.write(JSON.stringify({
      id: 1,
      type: 'start',
      payload: {
        query: `
          subscription {
            onPingDog {
              name
              owner {
                name
              }
            }
          }
        `
      }
    }))

    client.on('data', chunk => {
      const data = JSON.parse(chunk)

      if (data.type === 'connection_ack') {
        app.graphql.pubsub.publish({
          topic: 'PINGED_DOG',
          payload: { onPingDog: dogs[0] }
        })
      } else if (data.id === 1) {
        const expectedDog = dogs[0]
        expectedDog.owner = owners[dogs[0].name]

        t.same(data.payload.data.onPingDog, expectedDog)
        client.end()
        t.end()
      } else {
        t.fail()
      }
    })
  })
})
