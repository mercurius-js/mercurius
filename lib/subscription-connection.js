'use strict'

const on = require('events.on')
const { subscribe, parse } = require('graphql')
const { SubscriptionContext } = require('./subscriber')
const { kEntityResolvers } = require('./gateway/make-resolver')
const {
  GQL_CONNECTION_INIT,
  GQL_CONNECTION_ERROR,
  GQL_CONNECTION_ACK,
  GQL_CONNECTION_TERMINATE,
  GQL_START,
  GQL_DATA,
  GQL_ERROR,
  GQL_COMPLETE,
  GQL_STOP
} = require('./subscription-protocol')

module.exports = class SubscriptionConnection {
  constructor (socket, {
    schema,
    subscriber,
    fastify,
    lruGatewayResolvers,
    entityResolvers,
    context = {},
    onConnect,
    resolveContext
  }) {
    this.fastify = fastify
    this.socket = socket
    this.schema = schema
    this.lruGatewayResolvers = lruGatewayResolvers
    this.entityResolvers = entityResolvers
    this.subscriber = subscriber
    this.onConnect = onConnect
    this.subscriptionContexts = new Map()
    this.context = context
    this.isReady = false
    this.resolveContext = resolveContext

    this.socket.on('error', this.handleConnectionClose.bind(this))
    this.handleConnection()
  }

  async handleConnection () {
    for await (const message of on(this.socket, 'message')) {
      try {
        await this.handleMessage(message)
      } catch (err) {
        this.fastify.log.error(err)
        this.handleConnectionClose()
      }
    }
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
        await this.handleConnectionInit(data)
        break
      case GQL_CONNECTION_TERMINATE:
        this.handleConnectionClose()
        break
      case GQL_START: {
        if (this.isReady) {
          this.handleGQLStart(data).catch(e => {
            this.sendMessage(GQL_ERROR, id, e.message)
          })
        } else {
          this.sendMessage(GQL_CONNECTION_ERROR, undefined, { message: 'Connection has not been established yet.' })
          return this.handleConnectionClose()
        }
        break
      }
      case GQL_STOP:
        this.handleGQLStop(data)
        break
      default:
        this.sendMessage(GQL_ERROR, id, 'Invalid payload type')
    }
  }

  async handleConnectionInit (data) {
    if (typeof this.resolveContext === 'function') {
      try {
        this.context = {
          ...this.context,
          ...(await this.resolveContext())
        }
      } catch (err) {
        this.fastify.log.error(err)
        // 1011: Internal Error
        this.socket.close(1011)
        return
      }
    }

    if (typeof this.onConnect === 'function') {
      let authorize = false
      try {
        authorize = await this.onConnect(data)
      } catch (e) {
        this.fastify.log.error(e)
      }
      if (!authorize) {
        this.sendMessage(GQL_CONNECTION_ERROR, undefined, { message: 'Forbidden' })
        return this.handleConnectionClose()
      }

      // Merge context returned from onConnect
      if (typeof authorize === 'object') {
        this.context = {
          ...this.context,
          ...authorize
        }
      }
    }

    this.context._connectionInit = data.payload

    this.sendMessage(GQL_CONNECTION_ACK)
    this.isReady = true
  }

  async handleGQLStart (data) {
    // Starting a GraphQL subscription
    const { id, payload, extensions } = data
    const { query, variables, operationName } = payload

    let context = { ...this.context }

    if (extensions && extensions instanceof Array) {
      for (const extension of extensions) {
        switch (extension.type) {
          case 'connectionInit': {
            const authorize = await this.handleConnectionInitExtension(extension)
            if (typeof authorize === 'object') {
              context = {
                ...context,
                ...authorize
              }
            }
            break
          }
          default:
            throw new Error(`Unknown extension ${extension.type}`)
        }
      }
    }

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
        ...context,
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

    if (result.errors) {
      this.fastify.log.error(result.errors)
      throw result.errors[0]
    }

    // TODO implement backpressure
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

  async handleConnectionInitExtension (extension) {
    if (typeof this.onConnect === 'function') {
      let authorize = false
      try {
        authorize = await this.onConnect({
          type: 'connection_init',
          payload: extension.payload
        })
      } catch (e) {
        this.fastify.log.error(e)
      }
      if (!authorize) {
        throw new Error('Forbidden')
      }
      return authorize
    }

    return true
  }

  close () {
    this.handleConnectionClose()
  }
}
