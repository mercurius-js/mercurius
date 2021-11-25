'use strict'
const { BalancedPool, Pool } = require('undici')
const { URL } = require('url')
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
  let agent
  if (Array.isArray(opts.url)) {
    const upstreams = []
    for (const url of opts.url) {
      upstreams.push(new URL(url).origin)
    }

    agent = new BalancedPool(upstreams, agentOption(opts))
  } else {
    agent = new Pool(new URL(opts.url).origin, agentOption(opts))
  }

  const rewriteHeaders = opts.rewriteHeaders || function () { return {} }

  function close () {
    agent.destroy()
  }

  async function request (opts) {
    try {
      const response = await agent.request({
        method: opts.method,
        path: opts.url.pathname + (opts.qs || ''),
        headers: {
          ...rewriteHeaders(opts.originalRequestHeaders, opts.context),
          ...opts.headers
        },
        body: opts.body
      })

      return response
    } catch (err) {
      throw new FederatedError(err)
    }
  }

  return {
    request,
    close
  }
}

function sendRequest (request, url, useSecureParse) {
  return async function (opts) {
    try {
      const { body, statusCode } = await request({
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
      })

      const data = await body.text()
      const json = (useSecureParse ? sJSON : JSON).parse(data.toString())

      if (json.errors && json.errors.length) {
        // return a `FederatedError` instance to keep `graphql` happy
        // e.g. have something that derives from `Error`
        throw new FederatedError(json.errors)
      }

      return {
        statusCode,
        json
      }
    } catch (err) {
      if (err instanceof FederatedError) {
        throw err
      }
      throw new FederatedError(err)
    }
  }
}

module.exports = {
  buildRequest,
  sendRequest
}
