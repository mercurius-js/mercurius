'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('.')

test('basic GQL', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const root = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    root
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  t.deepEqual(res, {
    data: {
      add: 4
    }
  })
})

test('support context', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      ctx: Int
    }
  `

  const root = {
    ctx: async (_, ctx) => {
      t.equal(ctx.app, app)
      return ctx.num
    }
  }

  app.register(GQL, {
    schema,
    root
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ ctx }'
  const res = await app.graphql(query, { num: 42 })

  t.deepEqual(res, {
    data: {
      ctx: 42
    }
  })
})

test('variables', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const root = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    root
  })

  // needed so that graphql is defined
  await app.ready()

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'
  const res = await app.graphql(query, null, {
    x: 2,
    y: 2
  })

  t.deepEqual(res, {
    data: {
      add: 4
    }
  })
})

test('reply decorator', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const root = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    root
  })

  app.get('/', async function (req, reply) {
    const query = '{ add(x: 2, y: 2) }'
    return reply.graphql(query)
  })

  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('addToSchema and addToRoot', async (t) => {
  const app = Fastify()
  const schema = `
    extend type Query {
      add(x: Int, y: Int): Int
    }
  `

  const root = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL)

  app.register(async function (app) {
    app.graphql.extendSchema(schema)
    app.graphql.defineResolvers(root)
  })

  // needed so that graphql is defined
  await app.ready()

  const query = '{ add(x: 2, y: 2) }'
  const res = await app.graphql(query)

  t.deepEqual(res, {
    data: {
      add: 4
    }
  })
})

test('route', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const root = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    root
  })

  const query = '{ add(x: 2, y: 2) }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('routes variables', async (t) => {
  const app = Fastify()
  const schema = `
    type Query {
      add(x: Int, y: Int): Int
    }
  `

  const root = {
    add: async ({ x, y }) => x + y
  }

  app.register(GQL, {
    schema,
    root
  })

  // needed so that graphql is defined
  await app.ready()

  const query = 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query,
      variables: {
        x: 2,
        y: 2
      }
    }
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})
