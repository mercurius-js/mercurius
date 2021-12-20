'use strict'

const keys = {
  kLoaders: Symbol('mercurius.loaders'),
  kFactory: Symbol('mercurius.loadersFactory'),
  kSubscriptionFactory: Symbol('mercurius.subscriptionLoadersFactory'),
  kHooks: Symbol('mercurius.hooks'),
  kRequestContext: Symbol('mercurius.requestContext')
}

module.exports = keys
