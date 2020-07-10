'use strict'

const { subscribe, parse } = require('graphql')
const { SubscriptionContext } = require('./subscriber')
const { kEntityResolvers } = require('./gateway/make-resolver')
const HEARTBEAT_INTERVAL = 20 * 1000
const {
  GQL_CONNECTION_INIT,
  GQL_CONNECTION_ACK,
  GQL_CONNECTION_TERMINATE,
  GQL_START,
  GQL_DATA,
  GQL_ERROR,
  GQL_COMPLETE,
  GQL_STOP
} = require('../lib/subscription-protocol')

function heartbeat (socket) {
  socket.isAlive = true
}

module.exports = class SubscriptionConnection {
  constructor (
    socket,
    { schema, subscriber, fastify, lruGatewayResolvers, entityResolvers, context }
  ) {
    this.fastify = fastify
    this.socket = socket
    this.schema = schema
    this.lruGatewayResolvers = lruGatewayResolvers
    this.entityResolvers = entityResolvers
    this.subscriber = subscriber
    this.subscriptionContexts = new Map()
    this.context = context

    this.socket.isAlive = true
    const keepaliveInterval = setInterval(() => {
      if (!this.socket) {
        clearInterval(keepaliveInterval)
        return
      }
      if (!this.socket.isAlive) {
        this.close()
        return
      }
      this.socket.isAlive = false
      this.socket.ping(null, false)
    }, HEARTBEAT_INTERVAL).unref()

    this.socket.on('pong', () => {
      heartbeat(this.socket)
    })

    this.socket.on('message', (message) => {
      this.handleMessage(message).catch((e) => {
        this.fastify.log.error(e)
        this.handleConnectionClose()
      })
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

    const sc = new SubscriptionContext({
      fastify: this.fastify,
      pubsub: this.subscriber
    })
    this.subscriptionContexts.set(id, sc)

    const document = typeof query !== 'string' ? query : parse(query)

    const result = await subscribe(
      this.schema,
      document,
      {}, // rootValue
      {
        ...this.context,
        pubsub: sc,
        lruGatewayResolvers: this.lruGatewayResolvers,
        reply: {
          [kEntityResolvers]: this.entityResolvers,
          request: { headers: {} }
        }
      },
      variables,
      operationName
    )

    // TODO implement backpressure
    if (typeof result[Symbol.asyncIterator] === 'function') {
      for await (const value of result) {
        this.sendMessage(GQL_DATA, data.id, value)
      }

      this.sendMessage(GQL_COMPLETE, data.id, null)
    } else {
      // shit happened
      this.sendMessage(GQL_ERROR, data.id, 'Subscription failed')
    }
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
    Array.from(this.subscriptionContexts.values()).map((subscriptionContext) =>
      subscriptionContext.close()
    )
    this.socket.close()
  }

  sendMessage (type, id, payload) {
    try {
      this.socket.send(
        JSON.stringify({
          type,
          id,
          payload
        })
      )
    } catch (e) {
      this.handleConnectionClose()
    }
  }

  close () {
    this.handleConnectionClose()
  }
}
