'use strict'

const { on } = require('events')
const { subscribe, parse, print, getOperationAST } = require('graphql')
const { SubscriptionContext } = require('./subscriber')
const sJSON = require('secure-json-parse')
const { MER_ERR_GQL_SUBSCRIPTION_FORBIDDEN, MER_ERR_GQL_SUBSCRIPTION_UNKNOWN_EXTENSION, MER_ERR_GQL_SUBSCRIPTION_INVALID_OPERATION } = require('./errors')
const { preSubscriptionParsingHandler, onSubscriptionResolutionHandler, preSubscriptionExecutionHandler, onSubscriptionEndHandler, onSubscriptionConnectionCloseHandler, onSubscriptionConnectionErrorHandler } = require('./handlers')
const { kSubscriptionFactory, kLoaders } = require('./symbols')
const { getProtocolByName } = require('./subscription-protocol')
const { toGraphQLError } = require('./errors')

module.exports = class SubscriptionConnection {
  constructor (socket, {
    subscriber,
    fastify,
    entityResolversFactory,
    context = {},
    onConnect,
    onDisconnect,
    resolveContext,
    keepAlive,
    fullWsTransport,
    wsDefaultSubprotocol,
    queueHighWaterMark,
    errorFormatter
  }) {
    this.fastify = fastify
    this.socket = socket
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
    this.wsDefaultSubprotocol = wsDefaultSubprotocol
    this.queueHighWaterMark = queueHighWaterMark
    this.errorFormatter = errorFormatter
    this.headers = {}
    this.resolverContext = null

    this.protocolMessageTypes = getProtocolByName(socket.protocol, this.wsDefaultSubprotocol)
    this.socket.on('error', this.handleSocketConnectionError.bind(this))
    this.socket.on('close', this.handleSocketConnectionClose.bind(this))

    // We need a catch here because the socket might be closed before the connection is established
    // and we don't want to crash the server. Note that the errors are already
    // logged elsewhere @fastify/websocket so there is no need to log them again.
    this.handleConnection().catch(noop)
  }

  async handleConnection () {
    for await (const [message, isBinary] of on(this.socket, 'message')) {
      try {
        await this.handleMessage(message, isBinary)
      } catch (err) {
        this.fastify.log.error(err)
        this.handleConnectionClose()
      }
      /* c8 ignore next 3 */
    }
  }

  async handleMessage (message, isBinary) {
    let data
    try {
      data = sJSON.parse(isBinary ? message : message.toString())
    } catch (e) {
      this.sendError(new Error('Message must be a JSON string'), null)
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
          this.handleGQLStart(data).catch((e) => {
            this.sendError(e, id)
          })
        } else {
          await this.sendMessage(
            this.protocolMessageTypes.GQL_CONNECTION_ERROR,
            undefined,
            { message: 'Connection has not been established yet.' }
          )
          return this.handleConnectionClose()
        }
        break
      }
      case this.protocolMessageTypes.GQL_STOP:
        await this.handleGQLStop(data)
        break
      case this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE:
        // GQL_CONNECTION_KEEP_ALIVE_ACK is only defined in the graphql-ws protocol
        /* istanbul ignore next */
        if (this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE_ACK) {
          this.sendMessage(
            this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE_ACK,
            id
          )
        }
        break
      default:
        // GQL_CONNECTION_KEEP_ALIVE_ACK is only defined in the graphql-ws protocol
        if (
          this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE_ACK &&
          type === this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE_ACK
        ) {
          break
        }

        this.sendError(new Error('Invalid payload type'), id)
    }
  }

  async handleSocketConnectionClose (code, reason) {
    if (this.context.onSubscriptionConnectionClose) {
      try {
        await onSubscriptionConnectionCloseHandler({ context: this.resolverContext || this.context, code, reason })
        /* c8 ignore next 3 something wrong with coverage */
      } catch (error) {
        this.fastify.log.error(error)
      }
    }
    this.handleConnectionClose()
  }

  async handleSocketConnectionError (error) {
    if (this.context.onSubscriptionConnectionError) {
      try {
        await onSubscriptionConnectionErrorHandler({ context: this.resolverContext || this.context, error })
        /* c8 ignore next 3 something wrong with coverage */
      } catch (error) {
        this.fastify.log.error(error)
      }
    }
    this.handleConnectionClose()
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
        await this.sendMessage(this.protocolMessageTypes.GQL_CONNECTION_ERROR, undefined, { message: 'Forbidden' })
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

    if (data.payload) {
      if (data.payload.headers) {
        this.headers = data.payload.headers
      } else {
        this.headers = data.payload
      }
    }

    await this.sendMessage(this.protocolMessageTypes.GQL_CONNECTION_ACK)

    if (this.keepAlive) {
      this.sendKeepAlive()

      /* c8 ignore next 3 */
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
    this.resolverContext = context

    const sc = new SubscriptionContext({
      fastify: this.fastify,
      pubsub: this.subscriber,
      queueHighWaterMark: this.queueHighWaterMark
    })

    // Trigger preSubscriptionParsing hook
    if (this.context.preSubscriptionParsing !== null && typeof schema !== 'undefined' && typeof query === 'string') {
      await preSubscriptionParsingHandler({ schema, source: query, context, id })
    }

    this.subscriptionContexts.set(id, sc)

    // Trigger preSubscriptionExecution hook
    if (this.context.preSubscriptionExecution !== null && typeof schema !== 'undefined') {
      await preSubscriptionExecutionHandler({ schema, document, context, id })
    }

    let subscriptionLoaders
    if (this.fastify[kSubscriptionFactory]) {
      subscriptionLoaders = this.fastify[kSubscriptionFactory]
    }

    for (const [key, value] of Object.entries(this.headers)) {
      // as a security mechanism, do not override existing headers
      if (context.request.headers[key] === undefined) {
        context.request.headers[key] = value
      }
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
        id,
        pubsub: sc,
        lruGatewayResolvers: this.lruGatewayResolvers,
        reply: {
          request: context.request,
          [kLoaders]:
          subscriptionLoaders && subscriptionLoaders.create(context)
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

    for await (const value of subIter) {
      // Trigger onSubscriptionResolution hook
      if (this.context.onSubscriptionResolution !== null) {
        try {
          await onSubscriptionResolutionHandler({ execution: value, context, id })
        } catch (error) {
          this.fastify.log.error(error)
          return this.handleConnectionClose()
        }
      }

      const hasErrors = Array.isArray(value.errors) && value.errors.length > 0
      const response = hasErrors ? this.errorFormatter(value, this.context).response : value
      await this.sendMessage(this.protocolMessageTypes.GQL_DATA, id, response)
    }

    await this.sendMessage(this.protocolMessageTypes.GQL_COMPLETE, id, null)
    this.handleGQLComplete(id)
  }

  async _executeQueryOrMutation ({ query, context, variables, operationName, id }) {
    context.entityResolversFactory = this.entityResolversFactory

    const response = await this.fastify.graphql(
      query,
      context,
      variables,
      operationName
    )
    await this.sendMessage(this.protocolMessageTypes.GQL_DATA, id, response)
    await this.sendMessage(this.protocolMessageTypes.GQL_COMPLETE, id, null)
  }

  handleGQLComplete (id) {
    const sc = this.subscriptionContexts.get(id)
    if (sc) {
      sc.close && sc.close()
      this.subscriptionContexts.delete(id)
    }
    const subIter = this.subscriptionIters.get(id)
    if (subIter) {
      subIter.return && subIter.return()
      this.subscriptionIters.delete(id)
    }
  }

  async handleGQLStop (data) {
    if (this.context.onSubscriptionEnd) {
      try {
        await onSubscriptionEndHandler({ context: this.resolverContext, id: data.id })
      } catch (error) {
        this.fastify.log.error(error)
        return this.handleConnectionClose()
      }
    }

    this.handleGQLComplete(data.id)
  }

  handleConnectionClose () {
    this.subscriptionContexts.forEach(sc => sc.close())
    this.subscriptionContexts.clear()
    this.subscriptionIters.forEach(subIter => subIter.return && subIter.return())
    this.subscriptionIters.clear()
    this.socket.close()

    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer)

    if (typeof this.onDisconnect === 'function') {
      Promise.resolve()
        .then(() => this.onDisconnect(this.context))
        .catch((e) => { this.fastify.log.error(e) })
    }
  }

  async sendMessage (type, id, payload) {
    try {
      await new Promise((resolve, reject) => {
        this.socket.send(JSON.stringify({
          type,
          id,
          payload
        }), (err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
      })
    } catch (e) {
      this.handleConnectionClose()
    }
  }

  sendError (err, id) {
    const convertedError = toGraphQLError(err)
    // Graphql over websocket spec requires that errors are wrapped in an array
    this.sendMessage(this.protocolMessageTypes.GQL_ERROR, id, [convertedError])
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

function noop () {}
