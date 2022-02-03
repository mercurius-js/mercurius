'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('../..')

const invalidSchema = `
  extend type Query {
    hello: World!
  }
`

const validSchema = `
  extend type Query {
    foo: String!
  }
`

async function createRemoteService (schema) {
  const service = Fastify()
  service.post('/graphql', async (request, reply) => {
    reply.send({ data: { _service: { sdl: schema } } })
  })

  await service.listen(0)

  return [service, service.server.address().port]
}

test('Throws an Error and cleans up service connections correctly if there are no valid services', { timeout: 4000 }, async (t) => {
  const [service, servicePort] = await createRemoteService(invalidSchema)

  const gateway = Fastify()

  t.teardown(async () => {
    await gateway.close()
    await service.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'not-working',
        url: `http://localhost:${servicePort}/graphql`
      }]
    }
  })

  try {
    await gateway.ready()
  } catch (err) {
    t.equal(err.message, 'Gateway schema init issues No valid service SDLs were provided')
  }
})

test('Returns schema related errors for mandatory services', async (t) => {
  const [service, servicePort] = await createRemoteService(invalidSchema)

  const gateway = Fastify()

  t.teardown(async () => {
    await gateway.close()
    await service.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [{
        name: 'not-working',
        url: `http://localhost:${servicePort}/graphql`,
        mandatory: true
      }]
    }
  })

  try {
    await gateway.ready()
  } catch (err) {
    t.equal(err.message, 'Unknown type "World".')
  }
})

test('Does not error if at least one service schema is valid', async (t) => {
  const [service, servicePort] = await createRemoteService(validSchema)
  const [invalidService, invalidServicePort] = await createRemoteService(invalidSchema)

  const gateway = Fastify({
    logger: true
  })

  let warnCalled = 0
  gateway.log.warn = (message) => {
    warnCalled++
    t.matchSnapshot(message)
  }

  t.teardown(async () => {
    await gateway.close()
    await service.close()
    await invalidService.close()
  })

  gateway.register(GQL, {
    gateway: {
      services: [
        {
          name: 'working',
          url: `http://localhost:${servicePort}/graphql`
        },
        {
          name: 'not-working',
          url: `http://localhost:${invalidServicePort}/graphql`
        }
      ]
    }
  })

  try {
    await gateway.ready()
  } catch (err) {
    t.error(err)
  }
  t.equal(warnCalled, 2, 'Warning is called')
})
