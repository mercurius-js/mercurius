'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
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
        t.deepEqual(queries, [{
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
  t.deepEqual(JSON.parse(res.body), {
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
          t.deepEqual(queries, [{
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
  t.deepEqual(JSON.parse(res.body), {
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

test('defineLoaders method', async (t) => {
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
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
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

  t.deepEqual(JSON.parse(res.body), {
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
