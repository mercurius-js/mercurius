'use strict'

const { test } = require('tap')
const fp = require('fastify-plugin')
const Fastify = require('fastify')
const GQL = require('..')

test('plugin name definition', async (t) => {
  const app = Fastify()
  app.register(GQL)
  app.register(fp(async (app, opts) => {}, {
    dependencies: ['fastify-gql']
  }))

  t.resolves(app.ready())
})
