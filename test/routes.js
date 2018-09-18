'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const querystring = require('querystring')
const GQL = require('..')

test('POST route', async (t) => {
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

test('GET route', async (t) => {
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

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}'
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('POST route variables', async (t) => {
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

test('POST route operationName', async (t) => {
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

  const query = `
    query MyQuery ($x: Int!, $y: Int!) {
      add(x: $x, y: $y)
    }

    query Double ($x: Int!) {
      add(x: $x, y: $x)
    }
  `

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query,
      variables: {
        x: 2,
        y: 1
      },
      operationName: 'Double'
    }
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('GET route variables', async (t) => {
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

  const query = querystring.stringify({
    query: 'query ($x: Int!, $y: Int!) { add(x: $x, y: $y) }',
    variables: JSON.stringify({
      x: 2,
      y: 2
    })
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?' + query
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      add: 4
    }
  })
})

test('disable routes', async (t) => {
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
    root,
    routes: false
  })

  const res = await app.inject({
    method: 'GET',
    url: '/graphql?query={add(x:2,y:2)}'
  })

  t.deepEqual(res.statusCode, 404)
})

test('POST return 400 on error', async (t) => {
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

  const query = '{ add(x: 2, y: 2)'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400) // Bad Request
  t.matchSnapshot(JSON.stringify(JSON.parse(res.body), null, 2))
})
