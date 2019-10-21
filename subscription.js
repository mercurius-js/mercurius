'use strict'
const Websocket = require('fastify-websocket')
const { subscribe, parse } = require('graphql')

const GRAPHQL_WS = 'graphql-ws'
const GQL_CONNECTION_INIT = 'connection_init' // Client -> Server
const GQL_CONNECTION_ACK = 'connection_ack' // Server -> Client
const GQL_CONNECTION_ERROR = 'connection_error' // Server -> Client

// NOTE: The keep alive message type does not follow the standard due to connection optimizations
const GQL_CONNECTION_KEEP_ALIVE = 'ka' // Server -> Client

const GQL_CONNECTION_TERMINATE = 'connection_terminate' // Client -> Server
const GQL_START = 'start' // Client -> Server
const GQL_DATA = 'data' // Server -> Client
const GQL_ERROR = 'error' // Server -> Client
const GQL_COMPLETE = 'complete' // Server -> Client
const GQL_STOP = 'stop' // Client -> Server

function handle(conn) {
  conn.pipe(conn) // creates an echo server
}

function handleMessage(context) {
  return (message) => {
    const { socket } = context
    // TODO add error handling
    const data = JSON.parse(message)

    switch (data.type) {
      case GQL_CONNECTION_INIT:
        socket.send(JSON.stringify({
          type: GQL_CONNECTION_ACK
        }))
        break
      case GQL_CONNECTION_TERMINATE:
        socket.close()
        break
      case GQL_START:
        // eslint-disable-next-line
        const params = {
          query: data.payload.query,
          variables: data.payload.variables,
          operationName: data.payload.operationName,
          context: {},
          schema: context.schema
        }
        // eslint-disable-next-line
        const document = typeof params.query !== 'string' ? params.query : parse(params.query)
        return subscribe(
          params.schema,
          document,
          {}, // rootValue
          params.context,
          params.variables,
          params.operationName
        ).then(async result => {
          for await (const value of result) {
            socket.send(JSON.stringify({
              type: GQL_DATA,
              id: data.id,
              payload: value
            }))
          }
        }).then(() => {
          socket.send(JSON.stringify({
            type: GQL_COMPLETE,
            payload: null
          }))
        })
      case GQL_STOP:
        break
      default:
        socket.send(JSON.stringify({
          type: GQL_ERROR,
          payload: 'invalid type'
        }))
    }
  }
}

function createWSHandler(schema) {
  return (conn, req) => {
    conn.setEncoding('utf8')
    const { socket } = conn

    if (socket.protocol === undefined ||
      (socket.protocol.indexOf(GRAPHQL_WS) === -1)) {
      // Close the connection with an error code, ws v2 ensures that the
      // connection is cleaned up even when the closing handshake fails.
      // 1002: protocol error
      console.log('closing socket because protocol mismatch', socket.protocol)
      socket.close(1002)

      return
    }
    const context = {
      socket: conn.socket,
      schema
    }
    conn.socket.on('message', handleMessage(context))

    function handleConnectionClose(error) {
      if (error) {
        setTimeout(() => conn.socket.close(1011), 10)
      }

      // close socket & TODO: clean up subscriptions
      conn.socket.close()
    }

    conn.socket.on('error', handleConnectionClose)
    conn.socket.on('close', handleConnectionClose)
    conn.on('error', (e) => {
      // console.log('connection error', e)
    })
  }
}

module.exports = function (fastify, getOptions, schema) {
  fastify.register(Websocket, {
    handle,
    options: { maxPayload: 1048576 }
  })

  fastify.route({
    ...getOptions,
    wsHandler: createWSHandler(schema)
  })
}
