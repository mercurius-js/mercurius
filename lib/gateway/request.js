'use strict'
const http = require('http')
const https = require('https')
const eos = require('end-of-stream')
const { FederatedError } = require('../errors')

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

  const rewriteHeaders = opts.rewriteHeaders || function () { return {} }

  const requests = {
    'http:': http,
    'https:': https
  }

  function close () {
    agents['http:'].destroy()
    agents['https:'].destroy()
  }

  function request (opts, done) {
    const req = requests[opts.url.protocol].request({
      method: opts.method,
      port: opts.url.port,
      path: opts.url.pathname + (opts.qs || ''),
      hostname: opts.url.hostname,
      headers: {
        ...rewriteHeaders(opts.originalRequestHeaders),
        ...opts.headers
      },
      agent: agents[opts.url.protocol]
    })
    req.on('error', done)
    req.on('response', res => {
      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res })
    })
    req.end(opts.body)
  }

  return {
    request,
    close
  }
}

function sendRequest (request, url) {
  return function (opts) {
    return new Promise((resolve, reject) => {
      request({
        url,
        method: 'POST',
        body: opts.body,
        headers: {
          ...opts.headers,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(opts.body)
        },
        originalRequestHeaders: opts.originalRequestHeaders || {}
      }, (err, response) => {
        if (err) {
          return reject(err)
        }

        let data = ''
        response.stream.on('data', chunk => {
          data += chunk
        })

        eos(response.stream, (err) => {
          /* istanbul ignore if */
          if (err) {
            return reject(err)
          }

          try {
            const json = JSON.parse(data.toString())

            if (json.errors && json.errors.length) {
              // return a `FederatedError` instance to keep `graphql` happy
              // e.g. have something that derives from `Error`
              return reject(new FederatedError(json.errors))
            }

            resolve({
              statusCode: response.statusCode,
              json
            })
          } catch (e) {
            reject(e)
          }
        })
      })
    })
  }
}

module.exports = {
  buildRequest,
  sendRequest
}
