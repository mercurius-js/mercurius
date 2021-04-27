const { test } = require('tap')
const fastify = require('fastify')
const { sendRequest, buildRequest } = require('../../lib/gateway/request')

test('sendRequest method rejects when request errs', t => {
  const url = new URL('http://localhost:3001')
  const { request } = buildRequest({ url })
  t.rejects(sendRequest(request, url)({
    method: 'POST',
    body: JSON.stringify({
      query: `
      query ServiceInfo {
        _service {
          sdl
        }
      }
      `
    })
  }))
  t.end()
})

test('sendRequest method rejects when response is not valid json', async (t) => {
  const app = fastify()
  app.post('/', async (request, reply) => {
    return 'response'
  })

  await app.listen(0)

  const url = new URL(`http://localhost:${app.server.address().port}`)
  const { request, close } = buildRequest({ url })
  t.teardown(() => {
    close()
    return app.close()
  })
  t.rejects(sendRequest(request, url)({
    method: 'POST',
    body: JSON.stringify({
      query: `
      query ServiceInfo {
        _service {
          sdl
        }
      }
      `
    })
  }))

  t.end()
})

test('sendRequest method rejects when response contains errors', async (t) => {
  const app = fastify()
  app.post('/', async (request, reply) => {
    return { errors: ['foo'] }
  })

  await app.listen(0)

  const url = new URL(`http://localhost:${app.server.address().port}`)
  const { request, close } = buildRequest({ url })
  t.teardown(() => {
    close()
    return app.close()
  })
  t.rejects(
    sendRequest(
      request,
      url
    )({
      method: 'POST',
      body: JSON.stringify({
        query: `
      query ServiceInfo {
        _service {
          sdl
        }
      }
      `
      })
    })
  )

  t.end()
})
