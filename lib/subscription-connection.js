'use strict'

const on = require('events.on')
const { subscribe, parse, print, getOperationAST } = require('graphql')
const { SubscriptionContext } = require('./subscriber')
const { kEntityResolvers } = require('./gateway/make-resolver')
const sJSON = require('secure-json-parse')
const { MER_ERR_GQL_SUBSCRIPTION_FORBIDDEN, MER_ERR_GQL_SUBSCRIPTION_UNKNOWN_EXTENSION, MER_ERR_GQL_SUBSCRIPTION_INVALID_OPERATION } = require('./errors')
const { preSubscriptionParsingHandler, onSubscriptionResolutionHandler, preSubscriptionExecutionHandler, onSubscriptionEndHandler } = require('./handlers')
const { kSubscriptionFactory, kLoaders } = require('./symbols')
const { getProtocolByName } = require('./subscription-protocol')

module.exports = class SubscriptionConnection {
  constructor (socket, {
    subscriber,
    fastify,
    lruGatewayResolvers,
    entityResolversFactory,
    context = {},
    onConnect,
    onDisconnect,
    resolveContext,
    keepAlive,
    fullWsTransport
  }) {
    this.fastify = fastify
    this.socket = socket
    this.lruGatewayResolvers = lruGatewayResolvers
    this.entityResolversFactory = entityResolversFactory
    this.subscriber = subscriber
    this.onConnect = onConnect
    this.onDisconnect = onDisconnect
    this.subscriptionContexts = new Map()
    this.subscriptionIters = new Map()
    this.context = context
    this.isReady = false
    this.resolveContext = resolveContext
    this.keepAlive = keepAlive
    this.fullWsTransport = fullWsTransport
    this.headers = {}

    this.protocolMessageTypes = getProtocolByName(socket.protocol)
    this.socket.on('error', this.handleConnectionClose.bind(this))
    this.handleConnection()
  }

  async handleConnection () {
    for await (const [message, isBinary] of on(this.socket, 'message')) {
      try {
        await this.handleMessage(message, isBinary)
      } catch (err) {
        this.fastify.log.error(err)
        this.handleConnectionClose()
      }
    }
  }

  async handleMessage (message, isBinary) {
    let data
    try {
      data = sJSON.parse(isBinary ? message : message.toString())
    } catch (e) {
      this.sendMessage(this.protocolMessageTypes.GQL_ERROR, null, 'Message must be a JSON string')
      return
    }

    const { id, type } = data
    switch (type) {
      case this.protocolMessageTypes.GQL_CONNECTION_INIT:
        await this.handleConnectionInit(data)
        break
      case this.protocolMessageTypes.GQL_CONNECTION_TERMINATE:
        this.handleConnectionClose()
        break
      case this.protocolMessageTypes.GQL_START: {
        if (this.isReady) {
          this.handleGQLStart(data).catch(e => {
            this.sendMessage(this.protocolMessageTypes.GQL_ERROR, id, e.message)
          })
        } else {
          this.sendMessage(this.protocolMessageTypes.GQL_CONNECTION_ERROR, undefined, { message: 'Connection has not been established yet.' })
          return this.handleConnectionClose()
        }
        break
      }
      case this.protocolMessageTypes.GQL_STOP:
        await this.handleGQLStop(data)
        break
      default:
        this.sendMessage(this.protocolMessageTypes.GQL_ERROR, id, 'Invalid payload type')
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
        this.sendMessage(this.protocolMessageTypes.GQL_CONNECTION_ERROR, undefined, { message: 'Forbidden' })
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

    if (data.payload && data.payload.headers) {
      this.headers = data.payload.headers
    }

    this.sendMessage(this.protocolMessageTypes.GQL_CONNECTION_ACK)

    if (this.keepAlive) {
      this.sendKeepAlive()

      /* istanbul ignore next */
      this.keepAliveTimer = setInterval(() => {
        this.sendKeepAlive()
      }, this.keepAlive)
    }

    this.isReady = true
  }

  async handleGQLStart (data) {
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
            throw new MER_ERR_GQL_SUBSCRIPTION_UNKNOWN_EXTENSION(extension.type)
        }
      }
    }

    const document = typeof query !== 'string' ? query : parse(query)

    if (!document) {
      throw new Error('Must provide document.')
    }

    const operationAST = getOperationAST(document, operationName)

    if (operationAST.operation === 'subscription') {
      await this._executeSubscription({
        document,
        query,
        context,
        variables,
        operationName,
        id
      })
    } else if (
      this.fullWsTransport === true && (operationAST.operation === 'query' || operationAST.operation === 'mutation')) {
      await this._executeQueryOrMutation({
        query,
        context,
        variables,
        operationName,
        id
      })
    } else {
      throw new MER_ERR_GQL_SUBSCRIPTION_INVALID_OPERATION(operationAST.operation)
    }
  }

  async _executeSubscription ({ document, query, context, variables, operationName, id }) {
    const schema = this.fastify.graphql.schema

    const sc = new SubscriptionContext({
      fastify: this.fastify,
      pubsub: this.subscriber
    })

    // Trigger preSubscriptionParsing hook
    if (this.context.preSubscriptionParsing !== null && typeof schema !== 'undefined' && typeof query === 'string') {
      await preSubscriptionParsingHandler({ schema, source: query, context })
    }

    this.subscriptionContexts.set(id, sc)

    // Trigger preSubscriptionExecution hook
    if (this.context.preSubscriptionExecution !== null && typeof schema !== 'undefined') {
      await preSubscriptionExecutionHandler({ schema, document, context })
    }

    let subscriptionLoaders
    if (this.fastify[kSubscriptionFactory]) {
      subscriptionLoaders = this.fastify[kSubscriptionFactory]
    }

    const subIter = await subscribe({
      schema,
      document,
      rootValue: {},
      contextValue: {
        ...context,
        get __currentQuery () {
          return print(document)
        },
        pubsub: sc,
        lruGatewayResolvers: this.lruGatewayResolvers,
        reply: {
          entityResolversFactory: this.entityResolversFactory,
          request: { headers: this.headers },
          [kLoaders]:
            subscriptionLoaders && subscriptionLoaders.create(context),
          [kEntityResolvers]: this.entityResolvers
        }
      },
      variableValues: variables,
      operationName
    })
    this.subscriptionIters.set(id, subIter)

    if (subIter.errors) {
      this.fastify.log.error(subIter.errors)
      throw subIter.errors[0]
    }

    // TODO implement backpressure
    for await (const value of subIter) {
      // Trigger onSubscriptionResolution hook
      if (this.context.onSubscriptionResolution !== null) {
        try {
          await onSubscriptionResolutionHandler({ execution: value, context })
        } catch (error) {
          this.fastify.log.error(error)
          return this.handleConnectionClose()
        }
      }
      this.sendMessage(this.protocolMessageTypes.GQL_DATA, id, value)
    }

    this.sendMessage(this.protocolMessageTypes.GQL_COMPLETE, id, null)
  }

  async _executeQueryOrMutation ({ query, context, variables, operationName, id }) {
    const response = await this.fastify.graphql(
      query,
      context,
      variables,
      operationName
    )
    this.sendMessage(this.protocolMessageTypes.GQL_DATA, id, response)
    this.sendMessage(this.protocolMessageTypes.GQL_COMPLETE, id, null)
  }

  async handleGQLStop (data) {
    if (this.context.onSubscriptionEnd) {
      try {
        await onSubscriptionEndHandler({ context: this.context })
      } catch (error) {
        this.fastify.log.error(error)
        return this.handleConnectionClose()
      }
    }
    const sc = this.subscriptionContexts.get(data.id)
    if (sc) {
      sc.close && sc.close()
      this.subscriptionContexts.delete(data.id)
    }
    const subIter = this.subscriptionIters.get(data.id)
    if (subIter) {
      subIter.return && subIter.return()
      this.subscriptionIters.delete(data.id)
    }
  }

  handleConnectionClose () {
    Array
      .from(this.subscriptionContexts.values())
      .map((sc) => sc.close())
    Array
      .from(this.subscriptionIters.values())
      .map((subIter) => subIter.return && subIter.return())
    this.socket.close()

    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer)

    if (typeof this.onDisconnect === 'function') {
      Promise.resolve()
        .then(() => this.onDisconnect(this.context))
        .catch((e) => { this.fastify.log.error(e) })
    }
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
          type: this.protocolMessageTypes.GQL_CONNECTION_INIT,
          payload: extension.payload
        })
      } catch (e) {
        this.fastify.log.error(e)
      }
      if (!authorize) {
        throw new MER_ERR_GQL_SUBSCRIPTION_FORBIDDEN()
      }
      return authorize
    }

    return true
  }

  close () {
    this.handleConnectionClose()
  }

  sendKeepAlive () {
    this.sendMessage(this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE)
  }
}
