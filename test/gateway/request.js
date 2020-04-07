const { test } = require('tap')
const fastify = require('fastify')
const { sendRequest, buildRequest } = require('../../lib/gateway/request')

test('sendRequest method rejects when request errs', t => {
  const url = new URL('http://localhost:3001')
  const { request } = buildRequest({})
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
  t.tearDown(() => app.close())

  await app.listen(0)

  const url = new URL(`http://localhost:${app.server.address().port}`)
  const { request } = buildRequest({})
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
