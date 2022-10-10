'use strict'

const buildGateway = require('./gateway/build-gateway')
const { MER_ERR_INVALID_OPTS, MER_ERR_GQL_GATEWAY } = require('./errors')
const { assignApplicationLifecycleHooksToContext } = require('./hooks')
const { kHooks } = require('./symbols')
const { onGatewayReplaceSchemaHandler } = require('./handlers')

function validateGateway (schema, opts) {
  const gateway = opts.gateway
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

async function initGateway (opts, schema, fastifyGraphQl, app) {
  const gatewayOpts = opts.gateway
  validateGateway(schema, opts)

  let gatewayRetryIntervalTimer = null
  const retryServicesCount = gatewayOpts && gatewayOpts.retryServicesCount ? gatewayOpts.retryServicesCount : 10

  const retryInterval = gatewayOpts.retryServicesInterval || 3000
  const gateway = await buildGateway(gatewayOpts, app)

  const serviceMap = Object.values(gateway.serviceMap)
  const failedMandatoryServices = serviceMap.filter(service => !!service.error && service.mandatory)

  if (failedMandatoryServices.length) {
    gatewayRetryIntervalTimer = retryServices(retryInterval)
    gatewayRetryIntervalTimer.unref()
  }

  let gatewayInterval = null

  if (gatewayOpts.pollingInterval !== undefined) {
    if (typeof gatewayOpts.pollingInterval === 'number') {
      gatewayInterval = setInterval(async () => {
        try {
          const context = assignApplicationLifecycleHooksToContext({}, fastifyGraphQl[kHooks])
          const schema = await gateway.refresh()
          if (schema !== null) {
            // Trigger onGatewayReplaceSchema hook
            if (context.onGatewayReplaceSchema !== null) {
              await onGatewayReplaceSchemaHandler(context, { instance: app, schema })
            }
            fastifyGraphQl.replaceSchema(schema)
          }
        } catch (error) {
          app.log.error(error)
        }
      }, gatewayOpts.pollingInterval)
    } else {
      app.log.warn(`Expected a number for 'gateway.pollingInterval', received: ${typeof gatewayOpts.pollingInterval}`)
    }
  }

  app.onClose((fastify, next) => {
    gateway.close()
    if (gatewayInterval !== null) {
      clearInterval(gatewayInterval)
    }
    if (gatewayRetryIntervalTimer !== null) {
      clearInterval(gatewayRetryIntervalTimer)
    }
    setImmediate(next)
  })

  fastifyGraphQl.gateway = gateway
  fastifyGraphQl.extendSchema = function () {
    throw new MER_ERR_GQL_GATEWAY('Calling extendSchema method when plugin is running in gateway mode is not allowed')
  }

  fastifyGraphQl.defineResolvers = function () {
    throw new MER_ERR_GQL_GATEWAY('Calling defineResolvers method when plugin is running in gateway mode is not allowed')
  }

  fastifyGraphQl.defineLoaders = function () {
    throw new MER_ERR_GQL_GATEWAY('Calling defineLoaders method when plugin is running in gateway mode is not allowed')
  }
  return gateway

  function retryServices (interval) {
    let retryCount = 0
    let isRetry = true

    return setInterval(async () => {
      try {
        if (retryCount === retryServicesCount) {
          clearInterval(gatewayRetryIntervalTimer)
          isRetry = false
        }
        retryCount++

        const context = assignApplicationLifecycleHooksToContext({}, fastifyGraphQl[kHooks])
        const schema = await gateway.refresh(isRetry)
        /* istanbul ignore next */
        if (schema !== null) {
          clearInterval(gatewayRetryIntervalTimer)
          // Trigger onGatewayReplaceSchema hook
          if (context.onGatewayReplaceSchema !== null) {
            await onGatewayReplaceSchemaHandler(context, { instance: app, schema })
          }
          fastifyGraphQl.replaceSchema(schema)
        }
      } catch (error) {
        app.log.error(error)
      }
    }, interval)
  }
}

module.exports = {
  initGateway,
  validateGateway
}
