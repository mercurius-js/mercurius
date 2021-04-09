'use strict'
const { Pool } = require('undici')
const { URL } = require('url')
const eos = require('end-of-stream')
const { FederatedError } = require('../errors')
const sJSON = require('secure-json-parse')

function agentOption (opts) {
  return {
    bodyTimeout: opts.bodyTimeout || 30e3, // 30 seconds
    headersTimeout: opts.headersTimeout || 30e3, // 30 seconds
    maxHeaderSize: opts.maxHeaderSize || 16384, // 16 KiB
    keepAliveMaxTimeout: opts.keepAliveMaxTimeout || opts.keepAliveMsecs || 5 * 1000, // 5 seconds
    connections: opts.connections || opts.maxSockets || 10,
    tls: {
      rejectUnauthorized: opts.rejectUnauthorized
    }
  }
}

function buildRequest (opts) {
  const url = new URL(opts.url)
  const agent = new Pool(url.origin, agentOption(opts))

  const rewriteHeaders = opts.rewriteHeaders || function () { return {} }

  function close () {
    agent.destroy()
  }

  function request (opts, done) {
    agent.request({
      method: opts.method,
      path: opts.url.pathname + (opts.qs || ''),
      headers: {
        ...rewriteHeaders(opts.originalRequestHeaders, opts.context),
        ...opts.headers
      },
      body: opts.body
    }, (err, res) => {
      if (err) return done(err)
      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res.body })
    })
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
        originalRequestHeaders: opts.originalRequestHeaders || {},
        context: opts.context
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
            const json = sJSON.parse(data.toString())

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
