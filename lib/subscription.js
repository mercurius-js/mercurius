'use strict'

const fastifyWebsocket = require('fastify-websocket')
const SubscriptionConnection = require('./subscription-connection')
const GRAPHQL_WS = 'graphql-ws'

function handle (conn) {
  conn.end(JSON.stringify({ error: 'unknown route' }))
}

function createConnectionHandler ({ schema, subscriber, fastify, onConnect, lruGatewayResolvers, entityResolversFactory, subscriptionContextFn }) {
  return async (connection, request) => {
    const { socket } = connection
    if (socket.protocol === undefined ||
      (socket.protocol.indexOf(GRAPHQL_WS) === -1)) {
      // Close the connection with an error code, ws v2 ensures that the
      // connection is cleaned up even when the closing handshake fails.
      // 1002: protocol error
      socket.close(1002)

      return
    }

    const context = {}
    let resolveContext

    if (subscriptionContextFn) {
      resolveContext = () => subscriptionContextFn(connection, request)
    }

    const subscriptionConnection = new SubscriptionConnection(socket, {
      schema,
      subscriber,
      fastify,
      onConnect,
      lruGatewayResolvers,
      entityResolvers: entityResolversFactory && entityResolversFactory.create(),
      context,
      resolveContext
    })

    /* istanbul ignore next */
    connection.socket.on('error', () => {
      subscriptionConnection.close()
    })
    connection.socket.on('close', () => {
      subscriptionConnection.close()
    })
  }
}

module.exports = function (fastify, opts, next) {
  const { getOptions, schema, subscriber, verifyClient, onConnect, lruGatewayResolvers, entityResolversFactory, subscriptionContextFn } = opts
  fastify.register(fastifyWebsocket, {
    handle,
    options: {
      maxPayload: 1048576,
      verifyClient
    }
  })

  fastify.route({
    ...getOptions,
    wsHandler: createConnectionHandler({
      schema,
      subscriber,
      fastify,
      onConnect,
      lruGatewayResolvers,
      entityResolversFactory,
      subscriptionContextFn
    })
  })

  next()
}
