'use strict'

const buildGateway = require('./gateway/build-gateway')
const { MER_ERR_INVALID_OPTS } = require('./errors')

function validateGateway (schema, gateway, opts) {
  if (schema || opts.resolvers || opts.loaders) {
    throw new MER_ERR_INVALID_OPTS('Adding "schema", "resolvers" or "loaders" to plugin options when plugin is running in gateway mode is not allowed')
  }

  if (Array.isArray(gateway.services)) {
    const serviceNames = new Set()
    for (const service of gateway.services) {
      if (typeof service !== 'object') {
        throw new MER_ERR_INVALID_OPTS('gateway: all "services" must be objects')
      }
      if (typeof service.name !== 'string') {
        throw new MER_ERR_INVALID_OPTS('gateway: all "services" must have a "name" String property')
      }
      if (serviceNames.has(service.name)) {
        throw new MER_ERR_INVALID_OPTS(`gateway: all "services" must have a unique "name": "${service.name}" is already used`)
      }
      serviceNames.add(service.name)
      if (typeof service.url !== 'string' && (!Array.isArray(service.url) || service.url.length === 0 || !service.url.every(url => typeof url === 'string'))) {
        throw new MER_ERR_INVALID_OPTS('gateway: all "services" must have an "url" String, or a non-empty Array of String, property')
      }
    }
  }
}

module.exports = {
  buildGateway,
  validateGateway
}
