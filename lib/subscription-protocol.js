'use strict'

module.exports.GQL_CONNECTION_INIT = 'connection_init' // Client -> Server
module.exports.GQL_CONNECTION_ACK = 'connection_ack' // Server -> Client
module.exports.GQL_CONNECTION_ERROR = 'connection_error' // Server -> Client
module.exports.GQL_CONNECTION_KEEP_ALIVE = 'ka' // Server -> Client

module.exports.GQL_CONNECTION_TERMINATE = 'connection_terminate' // Client -> Server
module.exports.GQL_START = 'start' // Client -> Server
module.exports.GQL_DATA = 'data' // Server -> Client
module.exports.GQL_ERROR = 'error' // Server -> Client
module.exports.GQL_COMPLETE = 'complete' // Server -> Client
module.exports.GQL_STOP = 'stop' // Client -> Server

module.exports.GRAPHQL_WS = 'graphql-ws'
