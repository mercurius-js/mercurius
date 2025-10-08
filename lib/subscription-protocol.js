'use strict'

const GRAPHQL_WS = 'graphql-ws'
const GRAPHQL_TRANSPORT_WS = 'graphql-transport-ws'

const GRAPHQL_WS_PROTOCOL_SIGNALS = {
  GQL_CONNECTION_INIT: 'connection_init', // Client -> Server
  GQL_CONNECTION_ACK: 'connection_ack', // Server -> Client
  GQL_CONNECTION_ERROR: 'connection_error', // Server -> Client
  GQL_CONNECTION_KEEP_ALIVE: 'ka', // Server -> Client
  GQL_CONNECTION_TERMINATE: 'connection_terminate', // Client -> Server
  GQL_START: 'start', // Client -> Server
  GQL_DATA: 'data', // Server -> Client
  GQL_ERROR: 'error', // Server -> Client
  GQL_COMPLETE: 'complete', // Server -> Client
  GQL_STOP: 'stop' // Client -> Server
}

const GRAPHQL_TRANSPORT_WS_PROTOCOL_SIGNALS = {
  GQL_CONNECTION_INIT: 'connection_init', // Client -> Server
  GQL_CONNECTION_ACK: 'connection_ack', // Server -> Client
  GQL_CONNECTION_ERROR: 'connection_error', // Server -> Client
  GQL_CONNECTION_KEEP_ALIVE: 'ping', // Bidirectional
  GQL_CONNECTION_KEEP_ALIVE_ACK: 'pong', // Bidirectional
  GQL_CONNECTION_TERMINATE: 'connection_terminate', // Client -> Server
  GQL_START: 'subscribe', // Client -> Server
  GQL_DATA: 'next', // Server -> Client
  GQL_ERROR: 'error', // Server -> Client
  GQL_COMPLETE: 'complete', // Server -> Client
  GQL_STOP: 'complete' // Client -> Server
}

const PROTOCOLS = {
  [GRAPHQL_WS]: GRAPHQL_WS_PROTOCOL_SIGNALS,
  [GRAPHQL_TRANSPORT_WS]: GRAPHQL_TRANSPORT_WS_PROTOCOL_SIGNALS
}

module.exports.isValidClientProtocol = function (name, defaultProtocol) {
  return name === GRAPHQL_WS || name === GRAPHQL_TRANSPORT_WS || (defaultProtocol && !name)
}

module.exports.isValidServerProtocol = function (name) {
  return name === GRAPHQL_WS || name === GRAPHQL_TRANSPORT_WS
}

module.exports.getProtocolByName = function (name, defaultProtocol) {
  const signals = PROTOCOLS[name]
  if (signals) {
    return signals
  }

  if (defaultProtocol) {
    return PROTOCOLS[defaultProtocol]
  }
}

module.exports.GRAPHQL_WS = GRAPHQL_WS
module.exports.GRAPHQL_TRANSPORT_WS = GRAPHQL_TRANSPORT_WS
module.exports.GRAPHQL_TRANSPORT_WS_PROTOCOL_SIGNALS = GRAPHQL_TRANSPORT_WS_PROTOCOL_SIGNALS
module.exports.GRAPHQL_WS_PROTOCOL_SIGNALS = GRAPHQL_WS_PROTOCOL_SIGNALS
