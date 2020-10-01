'use strict'

const { test } = require('tap')
const fp = require('fastify-plugin')
const Fastify = require('fastify')
const GQL = require('..')

test('plugin name definition', async (t) => {
  const app = Fastify()
  const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
  `
  app.register(GQL, { schema })
  app.register(fp(async (app, opts) => {}, {
    dependencies: ['mercurius']
  }))

  t.resolves(app.ready())
})
