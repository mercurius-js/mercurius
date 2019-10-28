'use strict'
const Websocket = require('fastify-websocket')
const SubscriptionConnection = require('./subscription-connection')
const GRAPHQL_WS = 'graphql-ws'

function handle (conn) {
  conn.pipe(conn) // creates an echo server
}

function createConnectionHandler (schema, subscriber, fastify) {
  return (connection, request) => {
    connection.setEncoding('utf8')
    const { socket } = connection

    if (socket.protocol === undefined ||
      (socket.protocol.indexOf(GRAPHQL_WS) === -1)) {
      // Close the connection with an error code, ws v2 ensures that the
      // connection is cleaned up even when the closing handshake fails.
      // 1002: protocol error
      socket.close(1002)

      return
    }

    const subscriptionConnection = new SubscriptionConnection(socket, {
      schema,
      subscriber,
      fastify
    })

    connection.on('error', () => {
      subscriptionConnection.close()
    })
    connection.on('close', () => {
      subscriptionConnection.close()
    })
  }
}

module.exports = function (fastify, { getOptions, schema, subscriber, verifyClient }, next) {
  fastify.register(Websocket, {
    handle,
    options: {
      maxPayload: 1048576,
      verifyClient
    }
  })

  fastify.route({
    ...getOptions,
    wsHandler: createConnectionHandler(schema, subscriber, fastify)
  })

  next()
}
