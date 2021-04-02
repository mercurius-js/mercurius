'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('persistedQueryProvider errors when getHash is not provided', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  const persistedQueryProvider = {
    getHash: null
  }

  t.rejects(async () => {
    app.register(GQL, {
      schema,
      resolvers,
      persistedQueryProvider
    })

    await app.ready()
  })
})

test('persistedQueryProvider errors when getQueryFromHash is not provided', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  const persistedQueryProvider = {
    ...GQL.persistedQueryDefaults.prepared(),
    getQueryFromHash: null
  }

  t.rejects(async () => {
    app.register(GQL, {
      schema,
      resolvers,
      persistedQueryProvider
    })

    await app.ready()
  })
})

test('persistedQueryProvider errors when saveQuery is not provided', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  const persistedQueryProvider = {
    ...GQL.persistedQueryDefaults.automatic(),
    saveQuery: null
  }

  t.rejects(async () => {
    app.register(GQL, {
      schema,
      resolvers,
      persistedQueryProvider
    })

    await app.ready()
  })
})

test('automatic POST new query', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.automatic()
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      query: `
        query AddQuery ($x: Int!, $y: Int!) {
            add(x: $x, y: $y)
        }`
    }
  })

  t.same(JSON.parse(res.body), { data: { add: 3 } })
})

test('automatic POST new query, null result hashing a query is handled', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: {
      ...GQL.persistedQueryDefaults.automatic(),
      getHashForQuery: () => null
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      query: `
        query AddQuery ($x: Int!, $y: Int!) {
            add(x: $x, y: $y)
        }`
    }
  })

  t.same(JSON.parse(res.body), { data: { add: 3 } })
})

test('automatic POST new query, error on saveQuery is handled', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: {
      ...GQL.persistedQueryDefaults.automatic(),
      saveQuery: async (hash, query) => { throw new Error('Failed to save somewhere.') }
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      query: `
        query AddQuery ($x: Int!, $y: Int!) {
            add(x: $x, y: $y)
        }`
    }
  })

  t.same(JSON.parse(res.body), { data: { add: 3 } })
})

test('automatic POST new persisted query and error', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.automatic()
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '14b859faf7e656329f24f7fdc7a33a3402dbd8b43f4f57364e15e096143927a9'
        }
      }
    }
  })

  t.same(JSON.parse(res.body), { data: null, errors: [{ message: 'PersistedQueryNotFound' }] })
})

test('automatic POST invalid version persisted query and error', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.automatic()
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {
          version: 2,
          magicCode: '123'
        }
      }
    }
  })

  t.same(JSON.parse(res.body), { data: null, errors: [{ message: 'PersistedQueryNotSupported' }] })
})

test('automatic POST invalid extension and error', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.automatic()
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 }
    }
  })

  t.same(JSON.parse(res.body), { data: null, errors: [{ message: 'Unknown query' }] })
})

test('automatic POST invalid extension without persistedQueries and error', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.automatic()
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {}
      }
    }
  })

  t.same(JSON.parse(res.body), { data: null, errors: [{ message: 'PersistedQueryNotSupported' }] })
})

test('automatic POST persisted query after priming', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.automatic()
  })

  let res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      query: `
        query AddQuery ($x: Int!, $y: Int!) {
            add(x: $x, y: $y)
        }`
    }
  })

  t.same(JSON.parse(res.body), { data: { add: 3 } })

  res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '14b859faf7e656329f24f7fdc7a33a3402dbd8b43f4f57364e15e096143927a9'
        }
      }
    }
  })

  t.same(JSON.parse(res.body), { data: { add: 3 } })
})

test('automatic POST persisted query after priming, with extension set in both payloads', async (t) => {
  const app = Fastify()

  const schema = `
      type Query {
        add(x: Int, y: Int): Int
      }
    `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.automatic()
  })

  let res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      query: `
        query AddQuery ($x: Int!, $y: Int!) {
            add(x: $x, y: $y)
        }`,
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '14b859faf7e656329f24f7fdc7a33a3402dbd8b43f4f57364e15e096143927a9'
        }
      }
    }
  })

  t.same(JSON.parse(res.body), { data: { add: 3 } })

  res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '14b859faf7e656329f24f7fdc7a33a3402dbd8b43f4f57364e15e096143927a9'
        }
      }
    }
  })

  t.same(JSON.parse(res.body), { data: { add: 3 } })
})

// persistedQueryProvider

test('GET route with query, variables & persisted', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.prepared({
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    })
  })

  const res1 = await app.inject({
    method: 'GET',
    url: '/graphql?query=248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602&persisted=true'
  })

  t.same(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphql?query=495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf&variables={"x":2,"y":2}&persisted=true'
  })

  t.same(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'GET',
    url: '/graphql?query=03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e&persisted=true'
  })

  t.same(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('POST route with query, variables & persisted', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.prepared({
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    })
  })

  const res1 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602',
      persisted: true
    }
  })

  t.same(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf',
      variables: { x: 2, y: 2 },
      persisted: true
    }
  })

  t.same(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e',
      persisted: true
    }
  })

  t.same(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('preparedOnly POST route with query, variables & persisted', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.preparedOnly({
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    })
  })

  const res1 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602',
      persisted: true
    }
  })

  t.same(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf',
      variables: { x: 2, y: 2 },
      persisted: true
    }
  })

  t.same(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e',
      persisted: true
    }
  })

  t.same(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('preparedOnly reject unknown queries with 400 for GET route', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    graphiql: true,
    persistedQueryProvider: GQL.persistedQueryDefaults.preparedOnly({
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    })
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}' // custom/unknown query
  })

  t.equal(res.statusCode, 400)
})

test('preparedOnly reject unknown queries with 400 for POST route', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueryProvider: GQL.persistedQueryDefaults.preparedOnly({
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    })
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '{ add(x: 2, y: 2) }' // custom/unknown query
    }
  })

  t.equal(res.statusCode, 400)
})

// persistedQueries

test('persistedQueries GET route with query, variables & persisted', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    }
  })

  const res1 = await app.inject({
    method: 'GET',
    url: '/graphql?query=248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602&persisted=true'
  })

  t.same(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphql?query=495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf&variables={"x":2,"y":2}&persisted=true'
  })

  t.same(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'GET',
    url: '/graphql?query=03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e&persisted=true'
  })

  t.same(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('persistedQueries POST route with query, variables & persisted', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    }
  })

  const res1 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602',
      persisted: true
    }
  })

  t.same(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf',
      variables: { x: 2, y: 2 },
      persisted: true
    }
  })

  t.same(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e',
      persisted: true
    }
  })

  t.same(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('onlyPersisted POST route with query, variables & persisted', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    },
    onlyPersisted: true
  })

  const res1 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602',
      persisted: true
    }
  })

  t.same(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf',
      variables: { x: 2, y: 2 },
      persisted: true
    }
  })

  t.same(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e',
      persisted: true
    }
  })

  t.same(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('onlyPersisted reject unknown queries with 400 for GET route', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    graphiql: true,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    },
    onlyPersisted: true
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}' // custom/unknown query
  })

  t.equal(res.statusCode, 400)
})

test('onlyPersisted reject unknown queries with 400 for POST route', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const resolvers = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    resolvers,
    persistedQueries: {
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    },
    onlyPersisted: true
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query: '{ add(x: 2, y: 2) }' // custom/unknown query
    }
  })

  t.equal(res.statusCode, 400)
})
