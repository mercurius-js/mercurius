'use strict'

const { test } = require('node:test')
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

  try {
    await app.ready()
    t.assert.ok('Fastify app is ready and plugins loaded successfully')
  } catch (err) {
    t.assert.fail(`App failed to be ready: ${err.message}`)
  }
})
