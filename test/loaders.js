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
}].map(Object.freeze)

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
    puppies: [Dog]
    elders: [Dog]
  }

  type Subscription {
    onPingDog: Dog
  }
`

const resolvers = {
  Query: {
    dogs (_, params, { reply }) {
      return dogs
    },
    puppies (_, params, { reply }) {
      return [dogs[0]]
    },
    elders (_, params, { reply }) {
      return dogs.slice(2, dogs.length)
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

const puppiesQuery = `{
  puppies {
    name,
    owner {
      name
    }
  }
}`

const eldersQuery = `{
  elders {
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
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
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

test('loaders create batching resolvers with batchedQueries', async (t) => {
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
            name: 'Buddy'
          },
          params: {}
        }])
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders,
    allowBatchedQueries: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: [{ query: puppiesQuery }, { query: eldersQuery }]
  })

  t.equal(res.statusCode, 200)
  t.same(JSON.parse(res.body), [{
    data: {
      puppies: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  }, {
    data: {
      elders: [{
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
  }])
})

test('disable cache for each loader', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      owner: {
        async loader (queries, { reply }) {
          // note that the second entry for max is NOT cached
          const found = queries.map((q) => {
            return { obj: q.obj, params: q.params }
          })
          t.same(found, [{
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
          return queries.map(({ obj }) => {
            return { ...owners[obj.name] }
          })
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
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
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
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
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

  await t.rejects(async () => {
    await app.ready()
    app.graphql('query { test }')
  }, { message: 'Invalid options: Cannot find type test' })
})

test('minJit is not a number, throw error', async t => {
  const app = Fastify()

  app.register(GQL, {
    jit: '0'
  })

  await t.rejects(app.ready(), { message: 'Invalid options: the jit option must be a number' })
})

test('options cache is type = number', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: 256,
    schema
  })

  await app.ready()
})

test('options cache is !number && !boolean', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: 'cache'
  })

  await t.rejects(app.ready(), { message: 'Invalid options: Cache type is not supported' })
})

test('options cache is false and lruErrors exists', async t => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    cache: false
  })

  // needed so that graphql is defined
  await app.ready()
  await t.rejects(app.graphql('{ dogs { name { owner } } }'), { message: 'Graphql validation error' })
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
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
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
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
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
        owner: async () => [{ ...owners[dogs[0].name] }]
      }
    },
    subscription: {
      emitter
    }
  })

  app.listen({ port: 0 }, err => {
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
          payload: { onPingDog: { ...dogs[0] } }
        })
      } else if (data.id === 1) {
        const expectedDog = { ...dogs[0] }
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

test('Pass info to loader if cache is disabled', async (t) => {
  const app = Fastify()

  const dogs = [{
    dogName: 'Max',
    age: 10
  }, {
    dogName: 'Charlie',
    age: 13
  }, {
    dogName: 'Buddy',
    age: 15
  }, {
    dogName: 'Max',
    age: 17
  }]

  const cats = [{
    catName: 'Charlie',
    age: 10
  }, {
    catName: 'Max',
    age: 13
  }, {
    catName: 'Buddy',
    age: 15
  }]

  const owners = {
    Max: {
      nickName: 'Jennifer',
      age: 25
    },
    Charlie: {
      nickName: 'Sarah',
      age: 35
    },
    Buddy: {
      nickName: 'Tracy',
      age: 45
    }
  }

  const schema = `
    type Human {
      nickName: String!
      age: Int!
    }

    type Dog {
      dogName: String!
      age: Int!
      owner: Human
    }

    type Cat {
      catName: String!
      age: Int!
      owner: Human
    }

    type Query {
      dogs: [Dog]
      cats: [Cat]
    }
  `

  const query = `{
    dogs {
      dogName
      age
      owner {
        nickName
        age
      }
    }
    cats {
      catName
      owner {
        age
      }
    }
  }`
  const resolvers = {
    Query: {
      dogs: (_, params, context) => {
        return dogs
      },
      cats: (_, params, context) => {
        return cats
      }
    }
  }

  const loaders = {
    Dog: {
      owner: {
        async loader (queries, context) {
          t.equal(context.app, app)
          return queries.map(({ obj, info }) => {
            // verify info properties
            t.equal(info.operation.operation, 'query')

            const resolverOutputParams = info.operation.selectionSet.selections[0].selectionSet.selections
            t.equal(resolverOutputParams.length, 3)
            t.equal(resolverOutputParams[0].name.value, 'dogName')
            t.equal(resolverOutputParams[1].name.value, 'age')
            t.equal(resolverOutputParams[2].name.value, 'owner')

            const loaderOutputParams = resolverOutputParams[2].selectionSet.selections

            t.equal(loaderOutputParams.length, 2)
            t.equal(loaderOutputParams[0].name.value, 'nickName')
            t.equal(loaderOutputParams[1].name.value, 'age')

            return { ...owners[obj.dogName] }
          })
        },
        opts: {
          cache: false
        }
      }
    },
    Cat: {
      owner: {
        async loader (queries, context) {
          t.equal(context.app, app)
          return queries.map(({ obj, info }) => {
            // verify info properties
            t.equal(info.operation.operation, 'query')

            const resolverOutputParams = info.operation.selectionSet.selections[1].selectionSet.selections
            t.equal(resolverOutputParams.length, 2)
            t.equal(resolverOutputParams[0].name.value, 'catName')
            t.equal(resolverOutputParams[1].name.value, 'owner')

            const loaderOutputParams = resolverOutputParams[1].selectionSet.selections

            t.equal(loaderOutputParams.length, 1)
            t.equal(loaderOutputParams[0].name.value, 'age')

            return { ...owners[obj.catName] }
          })
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

  await app.ready()

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.strictSame(JSON.parse(res.body), {
    data: {
      dogs: [
        {
          dogName: 'Max',
          age: 10,
          owner: {
            nickName: 'Jennifer',
            age: 25
          }
        },
        {
          dogName: 'Charlie',
          age: 13,
          owner: {
            nickName: 'Sarah',
            age: 35
          }
        },
        {
          dogName: 'Buddy',
          age: 15,
          owner: {
            nickName: 'Tracy',
            age: 45
          }
        },
        {
          dogName: 'Max',
          age: 17,
          owner: {
            nickName: 'Jennifer',
            age: 25
          }
        }
      ],
      cats: [
        {
          catName: 'Charlie',
          owner: {
            age: 35
          }
        },
        {
          catName: 'Max',
          owner: {
            age: 25
          }
        },
        {
          catName: 'Buddy',
          owner: {
            age: 45
          }
        }
      ]
    }
  })
})

test('should not pass info to loader if cache is enabled', async (t) => {
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
      async owner (queries) {
        t.equal(queries[0].info, undefined)
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders,
    cache: true
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

test('loaders create batching resolvers', { only: true }, async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      async owner (queries, { reply }) {
        // note that the second entry for max is cached
        const found = queries.map((q) => {
          return { obj: q.obj, params: q.params }
        })
        t.same(found, [{
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
        return queries.map(({ obj }) => {
          return { ...owners[obj.name] }
        })
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders,
    cache: false
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
