'use strict'
const { printSchema } = require('graphql')
const http = require('http')
const https = require('https')
const pump = require('pump')
const URL = require('url').URL

const buildFederatedSchema = require('./federation')

function end (req, body, cb) {
  if (!body || typeof body === 'string' || body instanceof Uint8Array) {
    req.end(body)
  } else if (body.pipe) {
    pump(body, req, err => {
      if (err) cb(err)
    })
  } else {
    cb(new Error(`type unsupported for body: ${body.constructor}`))
  }
}

function agentOption (opts) {
  return {
    keepAlive: true,
    keepAliveMsecs: opts.keepAliveMsecs || 60 * 1000, // 1 minute
    maxSockets: opts.maxSockets || 2048,
    maxFreeSockets: opts.maxFreeSockets || 2048,
    rejectUnauthorized: opts.rejectUnauthorized
  }
}

function buildRequest (opts) {
  const agents = {
    'http:': new http.Agent(agentOption(opts)),
    'https:': new https.Agent(agentOption(opts))
  }

  const requests = {
    'http:': http,
    'https:': https
  }

  function close () {
    agents['http:'].destroy()
    agents['https:'].destroy()
  }

  function request (opts, done) {
    // console.log('sending request', opts.method, opts.url.port, opts.url.pathname, opts.url.hostname)
    const req = requests[opts.url.protocol].request({
      method: opts.method,
      port: opts.url.port,
      path: opts.url.pathname + (opts.qs || ''),
      hostname: opts.url.hostname,
      headers: opts.headers,
      agent: agents[opts.url.protocol]
    })
    req.on('error', done)
    req.on('response', res => {
      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res })
    })
    end(req, opts.body, done)
  }

  return {
    request,
    close
  }
}

function buildServiceMap (services) {
  const serviceMap = {}

  for (const service of services) {
    const { name, ...opts } = service
    const { request, close } = buildRequest(opts)
    const url = new URL(opts.url)

    serviceMap[service.name] = {
      request: function (opts) {
        return new Promise((resolve, reject) => {
          request({
            url,
            method: opts.method || 'POST',
            body: opts.body,
            headers: {
              'content-type': 'application/json',
              ...opts.headers
            }
          }, (err, response) => {
            if (err) {
              return reject(err)
            }

            if (response.statusCode === 200) {
              response.stream.on('data', data => resolve({
                statusCode: response.statusCode,
                json: JSON.parse(data.toString())
              }))
            }
          })
        })
      },
      close
    }
  }

  return serviceMap
}

async function buildGateway (gatewayOpts) {
  const { services } = gatewayOpts

  const serviceMap = buildServiceMap(gatewayOpts.services)

  const serviceSDLs = await Promise.all(services.map(service => serviceMap[service.name].request({
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
  }).then(response => response.json.data._service.sdl)))

  const schema = buildFederatedSchema(serviceSDLs.join(''))
  const execute = ''

  // console.log(printSchema(schema))

  return {
    schema,
    serviceMap,
    execute
  }
}

module.exports = buildGateway
