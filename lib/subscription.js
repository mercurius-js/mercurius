'use strict'

const fastifyWebsocket = require('@fastify/websocket')
const { assignLifeCycleHooksToContext, Hooks } = require('./hooks')
const { kHooks } = require('./symbols')
const SubscriptionConnection = require('./subscription-connection')
const { isValidClientProtocol } = require('./subscription-protocol')

function createConnectionHandler ({
  subscriber, fastify, onConnect, onDisconnect, entityResolversFactory, subscriptionContextFn, keepAlive,
  fullWsTransport, wsDefaultSubprotocol, queueHighWaterMark, errorFormatter
}) {
  return async (socket, request) => {
    if (!isValidClientProtocol(socket.protocol, wsDefaultSubprotocol)) {
      console.log('wrong websocket protocol: ' + socket.protocol)
      request.log.warn('wrong websocket protocol: ' + socket.protocol)
      // Close the connection with an error code, ws v2 ensures that the
      // connection is cleaned up even when the closing handshake fails.
      // 1002: protocol error
      socket.close(1002)

      return
    }

    let context = {
      app: fastify,
      pubsub: subscriber,
      request
    }

    if (context.app.graphql && context.app.graphql[kHooks]) {
      context = assignLifeCycleHooksToContext(context, context.app.graphql[kHooks])
    } else {
      context = assignLifeCycleHooksToContext(context, new Hooks())
    }

    let resolveContext

    if (subscriptionContextFn) {
      resolveContext = () => subscriptionContextFn(socket, request)
    }

    // eslint-disable-next-line no-new
    new SubscriptionConnection(socket, {
      subscriber,
      fastify,
      onConnect,
      onDisconnect,
      entityResolversFactory,
      context,
      resolveContext,
      keepAlive,
      fullWsTransport,
      wsDefaultSubprotocol,
      queueHighWaterMark,
      errorFormatter
    })
  }
}

module.exports = async function (fastify, opts) {
  const { getOptions, subscriber, verifyClient, onConnect, onDisconnect, entityResolversFactory, subscriptionContextFn, keepAlive, fullWsTransport, wsDefaultSubprotocol, queueHighWaterMark, errorFormatter } = opts

  // If `fastify.websocketServer` exists, it means `@fastify/websocket` already registered.
  // Without this check, @fastify/websocket will be registered multiple times and raises FST_ERR_DEC_ALREADY_PRESENT.
  if (fastify.websocketServer === undefined) {
    await fastify.register(fastifyWebsocket, {
      options: {
        maxPayload: 1048576,
        verifyClient
      }
    })
  }

  fastify.route({
    ...getOptions,
    wsHandler: createConnectionHandler({
      subscriber,
      fastify,
      onConnect,
      onDisconnect,
      entityResolversFactory,
      subscriptionContextFn,
      keepAlive,
      fullWsTransport,
      wsDefaultSubprotocol,
      queueHighWaterMark,
      errorFormatter
    })
  })
}
