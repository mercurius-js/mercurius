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

class SubscriptionContext {
  constructor ({ subscriber }) {
    this.subscriber = subscriber
    this.closes = []
  }

  subscribe (...args) {
    const { iterator, close } = this.subscriber.subscribe(...args)
    this.closes.push(close)

    return iterator
  }

  async close () {
    await Promise.all(this.closes.map(close => close()))
  }
}

function handle (conn) {
  conn.pipe(conn) // creates an echo server
}

function handleMessage (config) {
  return async (message) => {
    const { socket, schema, subscriptionContexts, subscriber, handleConnectionClose } = config

    // TODO add error handling
    const data = JSON.parse(message)

    switch (data.type) {
      case GQL_CONNECTION_INIT:
        // initialise graphql subscription
        socket.send(JSON.stringify({
          type: GQL_CONNECTION_ACK
        }))
        break
      case GQL_CONNECTION_TERMINATE:
        // TODO ??
        handleConnectionClose()
        break
      case GQL_START:
        // Starting GraphQL subscription
        // eslint-disable-next-line
        const sc = new SubscriptionContext({ subscriber })
        subscriptionContexts.set(data.id, sc)
        // eslint-disable-next-line
        const params = {
          query: data.payload.query,
          variables: data.payload.variables,
          operationName: data.payload.operationName,
          context: {
            pubsub: sc
          },
          schema
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
        })
      case GQL_STOP:
        // TODO handle unsubscribe for a given subscription id
        // eslint-disable-next-line
        const subscriptionContextToRemove = subscriptionContexts.get(data.id)
        if (!subscriptionContextToRemove) {
          return
        }

        await subscriptionContextToRemove.close()
        subscriptionContexts.delete(data.id)
        break
      default:
        socket.send(JSON.stringify({
          type: GQL_ERROR,
          payload: 'invalid type'
        }))
    }
  }
}

function createWSHandler (schema, subscriber) {
  return (conn, req) => {
    conn.setEncoding('utf8')
    const { socket } = conn

    if (socket.protocol === undefined ||
      (socket.protocol.indexOf(GRAPHQL_WS) === -1)) {
      // Close the connection with an error code, ws v2 ensures that the
      // connection is cleaned up even when the closing handshake fails.
      // 1002: protocol error
      socket.close(1002)

      return
    }

    const subscriptionContexts = new Map()

    const config = {
      socket: conn.socket,
      schema,
      subscriber,
      subscriptionContexts,
      handleConnectionClose
    }

    conn.socket.on('message', handleMessage(config))

    async function handleConnectionClose () {
      const a = Array.from(subscriptionContexts.values())
      await Promise.all(a.map(subscriptionContext =>
        subscriptionContext.close()))
      conn.socket.close()
    }

    conn.socket.on('error', handleConnectionClose)
    conn.socket.on('close', handleConnectionClose)
    conn.on('error', (e) => {})
  }
}

module.exports = function (fastify, getOptions, { schema, subscriber }) {
  fastify.register(Websocket, {
    handle,
    options: { maxPayload: 1048576 }
  })

  fastify.route({
    ...getOptions,
    wsHandler: createWSHandler(schema, subscriber)
  })
}
