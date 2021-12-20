'use strict'

const sJSON = require('secure-json-parse')

const WebSocket = require('ws')
const {
  GRAPHQL_TRANSPORT_WS,
  getProtocolByName
} = require('./subscription-protocol')
const { MER_ERR_GQL_SUBSCRIPTION_MESSAGE_INVALID, MER_ERR_GQL_SUBSCRIPTION_CONNECTION_NOT_READY, MER_ERR_INVALID_OPTS } = require('./errors')

class SubscriptionClient {
  constructor (uri, config) {
    this.uri = uri
    this.socket = null
    this.operationId = 0
    this.ready = false
    this.operations = new Map()
    this.operationsCount = {}
    this.subscriptionQueryMap = {}
    const {
      protocols = [],
      reconnect,
      maxReconnectAttempts = Infinity,
      serviceName,
      connectionCallback,
      failedConnectionCallback,
      failedReconnectCallback,
      connectionInitPayload,
      rewriteConnectionInitPayload,
      keepAlive
    } = config

    this.tryReconnect = reconnect
    this.maxReconnectAttempts = maxReconnectAttempts
    this.serviceName = serviceName
    this.reconnectAttempts = 0
    this.connectionCallback = connectionCallback
    this.failedConnectionCallback = failedConnectionCallback
    this.failedReconnectCallback = failedReconnectCallback
    this.connectionInitPayload = connectionInitPayload
    this.rewriteConnectionInitPayload = rewriteConnectionInitPayload
    this.keepAlive = keepAlive

    if (Array.isArray(protocols) && protocols.length > 0) {
      this.protocols = protocols
    } else {
      this.protocols = [GRAPHQL_TRANSPORT_WS]
    }

    this.protocolMessageTypes = getProtocolByName(this.protocols[0])
    this.keepAliveInterval = undefined

    if (this.protocolMessageTypes === null) {
      throw new MER_ERR_INVALID_OPTS(`${this.protocols[0]} is not a valid gateway subscription protocol`)
    }
    this.connect()
  }

  connect () {
    this.socket = new WebSocket(this.uri, this.protocols)

    this.socket.onopen = async () => {
      /* istanbul ignore else */
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          const payload = typeof this.connectionInitPayload === 'function'
            ? await this.connectionInitPayload()
            : this.connectionInitPayload
          this.sendMessage(null, this.protocolMessageTypes.GQL_CONNECTION_INIT, payload)
          if (this.keepAlive) {
            this.startKeepAliveInterval()
          }
        } catch (err) {
          this.close(this.tryReconnect, false)
        }
      }
    }

    this.socket.onclose = () => {
      if (!this.closedByUser) {
        this.close(this.tryReconnect, false)
      }
    }

    this.socket.onerror = () => {}

    this.socket.onmessage = async ({ data }) => {
      await this.handleMessage(data)
    }
  }

  close (tryReconnect, closedByUser = true) {
    this.closedByUser = closedByUser
    this.ready = false

    if (this.socket !== null) {
      if (closedByUser) {
        this.unsubscribeAll()
      }

      if (this.keepAlive && this.keepAliveTimeoutId) {
        this.stopKeepAliveInterval()
      }

      this.socket.close()
      this.socket = null
      this.reconnecting = false

      if (tryReconnect) {
        for (const operationId of this.operations.keys()) {
          const { options, handler, extensions } = this.operations.get(operationId)

          this.operations.set(operationId, {
            options,
            handler,
            extensions,
            started: false
          })
        }

        this.reconnect()
      }
    }
  }

  getReconnectDelay () {
    const delayMs = 100 * Math.pow(2, this.reconnectAttempts)

    return Math.min(delayMs, 10000)
  }

  reconnect () {
    if (
      this.reconnecting ||
      this.reconnectAttempts > this.maxReconnectAttempts
    ) {
      return this.failedReconnectCallback && this.failedReconnectCallback()
    }

    this.reconnectAttempts++
    this.reconnecting = true

    const delay = this.getReconnectDelay()

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect()
    }, delay)
  }

  unsubscribe (operationId, forceUnsubscribe) {
    let count = this.operationsCount[operationId]
    count--

    if (count === 0 || forceUnsubscribe) {
      this.sendMessage(operationId, this.protocolMessageTypes.GQL_STOP, null)
      this.operationsCount[operationId] = 0
    } else {
      this.operationsCount[operationId] = count
    }
  }

  unsubscribeAll () {
    for (const operationId of this.operations.keys()) {
      this.unsubscribe(operationId, true)
    }
  }

  sendMessage (operationId, type, payload = {}, extensions) {
    this.socket.send(
      JSON.stringify({
        id: operationId,
        type,
        payload,
        extensions
      })
    )
  }

  async handleMessage (message) {
    let data
    let operationId
    let operation

    try {
      data = sJSON.parse(message.toString())
      operationId = data.id
    } catch (e) {
      /* istanbul ignore next */
      throw new MER_ERR_GQL_SUBSCRIPTION_MESSAGE_INVALID(`"${message}" must be JSON parsable.`)
    }

    if (operationId) {
      operation = this.operations.get(operationId)
    }

    switch (data.type) {
      case this.protocolMessageTypes.GQL_CONNECTION_ACK:
        this.reconnecting = false
        this.ready = true
        this.reconnectAttempts = 0

        for (const operationId of this.operations.keys()) {
          this.startOperation(operationId)
        }

        if (this.connectionCallback) {
          this.connectionCallback()
        }

        break
      case this.protocolMessageTypes.GQL_DATA:
        /* istanbul ignore else */
        if (operation) {
          operation.handler(data.payload.data)
        }
        break
      case this.protocolMessageTypes.GQL_ERROR:
        /* istanbul ignore else */
        if (operation) {
          operation.handler(null)
          this.operations.delete(operationId)
          this.sendMessage(operationId, this.protocolMessageTypes.GQL_ERROR, data.payload)
        }
        break
      case this.protocolMessageTypes.GQL_COMPLETE:
        /* istanbul ignore else */
        if (operation) {
          operation.handler(null)
          this.operations.delete(operationId)
        }

        break
      case this.protocolMessageTypes.GQL_CONNECTION_ERROR:
        this.close(this.tryReconnect, false)
        if (this.failedConnectionCallback) {
          await this.failedConnectionCallback(data.payload)
        }
        break
      case this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE:
        break
      /* istanbul ignore next */
      default:
        /* istanbul ignore next */
        throw new MER_ERR_GQL_SUBSCRIPTION_MESSAGE_INVALID(`Invalid message type "${data.type}"`)
    }
  }

  startOperation (operationId) {
    const { started, options, handler, extensions } = this.operations.get(operationId)
    if (!started) {
      if (!this.ready) {
        throw new MER_ERR_GQL_SUBSCRIPTION_CONNECTION_NOT_READY()
      }
      this.operations.set(operationId, { started: true, options, handler, extensions })
      this.sendMessage(operationId, this.protocolMessageTypes.GQL_START, options, extensions)
    }
  }

  createSubscription (query, variables, publish, context) {
    const subscriptionString = JSON.stringify({ query, variables })
    let operationId = this.subscriptionQueryMap[subscriptionString]

    if (operationId && this.operations.get(operationId)) {
      this.operationsCount[operationId] = this.operationsCount[operationId] + 1
      return operationId
    }

    operationId = String(++this.operationId)

    const operation = {
      started: false,
      options: { query, variables },
      handler: async (data) => {
        await publish({
          topic: `${this.serviceName}_${operationId}`,
          payload: data
        })
      }
    }

    let connectionInit
    if (context) {
      connectionInit = context._connectionInit
    }
    if (this.rewriteConnectionInitPayload) {
      connectionInit = this.rewriteConnectionInitPayload(connectionInit, context)
    }

    if (connectionInit) {
      operation.extensions = [{
        type: 'connectionInit',
        payload: connectionInit
      }]
    }

    this.operations.set(operationId, operation)
    this.startOperation(operationId)
    this.operationsCount[operationId] = 1

    this.subscriptionQueryMap[subscriptionString] = operationId

    return operationId
  }

  startKeepAliveInterval () {
    this.keepAliveTimeoutId = setInterval(() => {
      this.sendMessage(null, this.protocolMessageTypes.GQL_CONNECTION_KEEP_ALIVE)
    }, this.keepAlive)
    this.keepAliveTimeoutId.unref()
  }

  stopKeepAliveInterval () {
    clearTimeout(this.keepAliveTimeoutId)
  }
}

module.exports = SubscriptionClient
