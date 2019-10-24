'use strict'
const Websocket = require('fastify-websocket')
const { subscribe, parse } = require('graphql')

const GRAPHQL_WS = 'graphql-ws'
const GQL_CONNECTION_INIT = 'connection_init' // Client -> Server
const GQL_CONNECTION_ACK = 'connection_ack' // Server -> Client

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

  close () {
    this.closes.map(close => close())
  }
}

function handle (conn) {
  conn.pipe(conn) // creates an echo server
}

class SubscriptionConnection {
  constructor (socket, {
    schema,
    subscriber
  }) {
    this.socket = socket
    this.schema = schema
    this.subscriber = subscriber
    this.subscriptionContexts = new Map()

    this.socket.on('message', (message) => {
      try {
        this.handleMessage(message)
      } catch (e) {
        this.handleConnectionClose()
      }
    })
    this.socket.on('error', this.handleConnectionClose.bind(this))
  }

  async handleMessage (message) {
    let data
    try {
      data = JSON.parse(message)
    } catch (e) {
      this.sendMessage(GQL_ERROR, null, 'Message must be a JSON string')
      return
    }

    const { id, type } = data

    switch (type) {
      case GQL_CONNECTION_INIT:
        this.sendMessage(GQL_CONNECTION_ACK)
        break
      case GQL_CONNECTION_TERMINATE:
        this.handleConnectionClose()
        break
      case GQL_START:
        try {
          await this.handleGQLStart(data)
        } catch (e) {
          this.sendMessage(GQL_ERROR, id, e.message)
        }
        break
      case GQL_STOP:
        this.handleGQLStop(data)
        break
      default:
        this.sendMessage(GQL_ERROR, id, 'Invalid payload type')
    }
  }

  async handleGQLStart (data) {
    // Starting a GraphQL subscription
    const { id, payload } = data
    const { query, variables, operationName } = payload

    const sc = new SubscriptionContext({ subscriber: this.subscriber })
    this.subscriptionContexts.set(id, sc)

    const document = typeof query !== 'string' ? query : parse(query)

    const result = await subscribe(
      this.schema,
      document,
      {}, // rootValue
      {
        pubsub: sc
      },
      variables,
      operationName
    )

    for await (const value of result) {
      this.sendMessage(GQL_DATA, data.id, value)
    }

    this.sendMessage(GQL_COMPLETE, data.id, null)
  }

  handleGQLStop (data) {
    const subscriptionContextToRemove = this.subscriptionContexts.get(data.id)
    if (!subscriptionContextToRemove) {
      return
    }

    subscriptionContextToRemove.close()
    this.subscriptionContexts.delete(data.id)
  }

  handleConnectionClose () {
    Array
      .from(this.subscriptionContexts.values())
      .map(subscriptionContext =>
        subscriptionContext.close())
    this.socket.close()
  }

  sendMessage (type, id, payload) {
    try {
      this.socket.send(JSON.stringify({
        type,
        id,
        payload
      }))
    } catch (e) {
      this.handleConnectionClose()
    }
  }

  close () {
    this.handleConnectionClose()
  }
}

function createConnectionHandler (schema, subscriber) {
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
      subscriber
    })

    connection.on('error', () => {
      subscriptionConnection.close()
    })
    connection.on('close', () => {
      subscriptionConnection.close()
    })
  }
}

module.exports = function (fastify, { getOptions, schema, subscriber }, next) {
  fastify.register(Websocket, {
    handle,
    options: { maxPayload: 1048576 }
  })

  fastify.route({
    ...getOptions,
    wsHandler: createConnectionHandler(schema, subscriber)
  })

  next()
}
