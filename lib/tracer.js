'use strict'
const api = require('@opentelemetry/api')
const meta = require('../package.json')

module.exports = api.trace.getTracer(meta.name, meta.version)
