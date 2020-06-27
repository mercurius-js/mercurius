'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

test('Automatic POST new query', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Automatic()
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

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })
})

test('Automatic POST new query, error on saveQuery is handled', async (t) => {
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
    persistedQuerySettings: {
      ...GQL.PersistedQueryDefaults.Automatic(),
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

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })
})

test('Automatic POST new query, only one of hash or saveQuery is required', async (t) => {
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
    persistedQuerySettings: {
      ...GQL.PersistedQueryDefaults.Automatic(),
      saveQuery: null
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

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })
})

test('Automatic POST new persisted query and error', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Automatic()
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

  t.deepEqual(JSON.parse(res.body), { data: null, errors: [{ message: 'PersistedQueryNotFound' }] })
})

test('Automatic POST invalid version persisted query and error', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Automatic()
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

  t.deepEqual(JSON.parse(res.body), { data: null, errors: [{ message: 'PersistedQueryNotSupported' }] })
})

test('Automatic POST invalid extension and error', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Automatic()
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      operationName: 'AddQuery',
      variables: { x: 1, y: 2 }
    }
  })

  t.deepEqual(JSON.parse(res.body), { data: null, errors: [{ message: 'Unknown query' }] })
})

test('Automatic POST invalid extension without persistedQueries and error', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Automatic()
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

  t.deepEqual(JSON.parse(res.body), { data: null, errors: [{ message: 'PersistedQueryNotSupported' }] })
})

test('Automatic POST persisted query after priming', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Automatic()
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

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })

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

  t.deepEqual(JSON.parse(res.body), { data: { add: 3 } })
})

// persistedQuerySettings

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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Prepared({
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }',
      '495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf': 'query Add($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
      '03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e': '{ add(x: 3, y: 3) }'
    })
  })

  const res1 = await app.inject({
    method: 'GET',
    url: '/graphql?query=248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602&persisted=true'
  })

  t.deepEqual(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphql?query=495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf&variables={"x":2,"y":2}&persisted=true'
  })

  t.deepEqual(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'GET',
    url: '/graphql?query=03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e&persisted=true'
  })

  t.deepEqual(JSON.parse(res3.body), {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.Prepared({
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

  t.deepEqual(JSON.parse(res1.body), {
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

  t.deepEqual(JSON.parse(res2.body), {
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

  t.deepEqual(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('PreparedOnly POST route with query, variables & persisted', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.PreparedOnly({
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

  t.deepEqual(JSON.parse(res1.body), {
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

  t.deepEqual(JSON.parse(res2.body), {
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

  t.deepEqual(JSON.parse(res3.body), {
    data: {
      add: 6
    }
  })
})

test('PreparedOnly reject unknown queries with 400 for GET route', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.PreparedOnly({
      '248eb276edb4f22aced0a2848c539810b55f79d89abc531b91145e76838f5602': '{ add(x: 1, y: 1) }'
    })
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}' // custom/unknown query
  })

  t.is(res.statusCode, 400)
})

test('PreparedOnly reject unknown queries with 400 for POST route', async (t) => {
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
    persistedQuerySettings: GQL.PersistedQueryDefaults.PreparedOnly({
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

  t.deepEqual(JSON.parse(res1.body), {
    data: {
      add: 2
    }
  })

  const res2 = await app.inject({
    method: 'GET',
    url: '/graphql?query=495ccd73abc8436544cfeedd65f24beee660d2c7be2c32536e3fbf911f935ddf&variables={"x":2,"y":2}&persisted=true'
  })

  t.deepEqual(JSON.parse(res2.body), {
    data: {
      add: 4
    }
  })

  const res3 = await app.inject({
    method: 'GET',
    url: '/graphql?query=03ec1635d1a0ea530672bf33f28f3533239a5a7021567840c541c31d5e28c65e&persisted=true'
  })

  t.deepEqual(JSON.parse(res3.body), {
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

  t.deepEqual(JSON.parse(res1.body), {
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

  t.deepEqual(JSON.parse(res2.body), {
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

  t.deepEqual(JSON.parse(res3.body), {
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

  t.deepEqual(JSON.parse(res1.body), {
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

  t.deepEqual(JSON.parse(res2.body), {
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

  t.deepEqual(JSON.parse(res3.body), {
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

  t.is(res.statusCode, 400)
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
