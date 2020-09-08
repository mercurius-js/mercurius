'use strict'

const WebSocket = require('ws')
const {
  GQL_CONNECTION_INIT,
  GQL_CONNECTION_ACK,
  GQL_CONNECTION_ERROR,
  GQL_CONNECTION_KEEP_ALIVE,
  GQL_START,
  GQL_DATA,
  GQL_ERROR,
  GQL_COMPLETE,
  GQL_STOP,
  GRAPHQL_WS
} = require('./subscription-protocol')

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
      connectionInitPayload
    } = config

    this.protocols = [GRAPHQL_WS, ...protocols]
    this.tryReconnect = reconnect
    this.maxReconnectAttempts = maxReconnectAttempts
    this.serviceName = serviceName
    this.reconnectAttempts = 0
    this.connectionCallback = connectionCallback
    this.failedConnectionCallback = failedConnectionCallback
    this.failedReconnectCallback = failedReconnectCallback
    this.connectionInitPayload = connectionInitPayload

    this.connect()
  }

  connect () {
    this.socket = new WebSocket(this.uri, this.protocols)

    this.socket.onopen = async () => {
      /* istanbul ignore else */
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          const payload = typeof this.connectionInitPayload === 'function'
            ? await this.connectionInitPayload() : this.connectionInitPayload
          this.sendMessage(null, GQL_CONNECTION_INIT, payload)
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
      this.sendMessage(operationId, GQL_STOP, null)
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
      data = JSON.parse(message)
      operationId = data.id
    } catch (e) {
      /* istanbul ignore next */
      throw new Error(
        `Invalid message received: "${message}" Message must be JSON parsable.`
      )
    }

    if (operationId) {
      operation = this.operations.get(operationId)
    }

    switch (data.type) {
      case GQL_CONNECTION_ACK:
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
      case GQL_DATA:
        /* istanbul ignore else */
        if (operation) {
          operation.handler(data.payload.data)
        }
        break
      case GQL_ERROR:
        /* istanbul ignore else */
        if (operation) {
          operation.handler(null)
          this.operations.delete(operationId)
          this.sendMessage(operationId, GQL_ERROR, data.payload)
        }
        break
      case GQL_COMPLETE:
        /* istanbul ignore else */
        if (operation) {
          operation.handler(null)
          this.operations.delete(operationId)
        }

        break
      case GQL_CONNECTION_ERROR:
        this.close(this.tryReconnect, false)
        if (this.failedConnectionCallback) {
          await this.failedConnectionCallback(data.payload)
        }
        break
      case GQL_CONNECTION_KEEP_ALIVE:
        break
      /* istanbul ignore next */
      default:
        /* istanbul ignore next */
        throw new Error(`Invalid message type: "${data.type}"`)
    }
  }

  startOperation (operationId) {
    const { started, options, handler, extensions } = this.operations.get(operationId)
    if (!started) {
      if (!this.ready) {
        throw new Error('Connection is not ready')
      }
      this.operations.set(operationId, { started: true, options, handler, extensions })
      this.sendMessage(operationId, GQL_START, options, extensions)
    }
  }

  createSubscription (query, variables, publish, connectionInit) {
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
}

module.exports = SubscriptionClient
