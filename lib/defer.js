'use strict'

const { Readable } = require('node:stream')
const { GraphQLSchema, GraphQLDeferDirective } = require('graphql')
// `legacyExecuteIncrementally` (graphql@17) produces the incremental delivery
// payload format of the `deferSpec=20220824` media type, which is what
// Apollo Client speaks. It is not available on graphql@16.
const { legacyExecuteIncrementally } = require('graphql')

const DEFER_SPEC = '20220824'
const MULTIPART_CONTENT_TYPE = `multipart/mixed; boundary="-"; deferSpec=${DEFER_SPEC}`

function isDeferSupported () {
  return typeof legacyExecuteIncrementally === 'function' && !!GraphQLDeferDirective
}

function addDeferDirective (schema) {
  if (schema.getDirective('defer')) {
    return schema
  }

  const config = schema.toConfig()
  return new GraphQLSchema({
    ...config,
    directives: [...config.directives, GraphQLDeferDirective]
  })
}

// Returns true when the Accept header contains a `multipart/mixed` media
// range with `deferSpec=20220824` and a non-zero quality.
function acceptsDeferMultipart (acceptHeader) {
  if (typeof acceptHeader !== 'string') {
    return false
  }

  for (const range of acceptHeader.split(',')) {
    const [type, ...params] = range.split(';').map(s => s.trim())
    if (type.toLowerCase() !== 'multipart/mixed') {
      continue
    }

    let deferSpec = null
    let q = 1
    for (const param of params) {
      const index = param.indexOf('=')
      if (index === -1) {
        continue
      }
      const key = param.slice(0, index).trim().toLowerCase()
      const value = param.slice(index + 1).trim().replace(/^"(.*)"$/, '$1')
      if (key === 'deferspec') {
        deferSpec = value
      } else if (key === 'q') {
        q = Number(value)
      }
    }

    if (deferSpec === DEFER_SPEC && q > 0) {
      return true
    }
  }

  return false
}

function orderInitialResultFields (result) {
  return {
    hasNext: result.hasNext,
    errors: result.errors,
    data: result.data,
    incremental: orderIncrementalResultFields(result.incremental),
    extensions: result.extensions
  }
}

function orderSubsequentResultFields (result) {
  return {
    hasNext: result.hasNext,
    incremental: orderIncrementalResultFields(result.incremental),
    extensions: result.extensions
  }
}

function orderIncrementalResultFields (incremental) {
  return incremental?.map((i) => ({
    hasNext: i.hasNext,
    errors: i.errors,
    path: i.path,
    label: i.label,
    data: i.data,
    items: i.items,
    extensions: i.extensions
  }))
}

function formatPart (result, hasNext) {
  return `content-type: application/json; charset=utf-8\r\n\r\n${JSON.stringify(result)}\r\n---${hasNext ? '' : '--'}\r\n`
}

async function * writeMultipartBody (initialResult, subsequentResults) {
  yield '\r\n---\r\n' + formatPart(orderInitialResultFields(initialResult), initialResult.hasNext)

  for await (const result of subsequentResults) {
    yield formatPart(orderSubsequentResultFields(result), result.hasNext)
  }
}

function createMultipartStream ({ initialResult, subsequentResults }) {
  return Readable.from(writeMultipartBody(initialResult, subsequentResults))
}

module.exports = {
  MULTIPART_CONTENT_TYPE,
  isDeferSupported,
  addDeferDirective,
  acceptsDeferMultipart,
  createMultipartStream,
  executeIncrementally: legacyExecuteIncrementally
}
