'use strict'
const { test } = require('node:test')
const { getProtocolByName } = require('../lib/subscription-protocol')

test('getProtocolByName returns correct protocol message types', t => {
  t.plan(3)
  t.assert.deepStrictEqual(getProtocolByName('graphql-ws'), {
    GQL_CONNECTION_INIT: 'connection_init',
    GQL_CONNECTION_ACK: 'connection_ack',
    GQL_CONNECTION_ERROR: 'connection_error',
    GQL_CONNECTION_KEEP_ALIVE: 'ka',
    GQL_CONNECTION_TERMINATE: 'connection_terminate',
    GQL_START: 'start',
    GQL_DATA: 'data',
    GQL_ERROR: 'error',
    GQL_COMPLETE: 'complete',
    GQL_STOP: 'stop'
  })
  t.assert.deepStrictEqual(getProtocolByName('graphql-transport-ws'), {
    GQL_CONNECTION_INIT: 'connection_init',
    GQL_CONNECTION_ACK: 'connection_ack',
    GQL_CONNECTION_ERROR: 'connection_error',
    GQL_CONNECTION_KEEP_ALIVE: 'ping',
    GQL_CONNECTION_KEEP_ALIVE_ACK: 'pong',
    GQL_CONNECTION_TERMINATE: 'connection_terminate',
    GQL_START: 'subscribe',
    GQL_DATA: 'next',
    GQL_ERROR: 'error',
    GQL_COMPLETE: 'complete',
    GQL_STOP: 'complete'
  })
  t.assert.deepStrictEqual(getProtocolByName('unsupported-protocol'), null)
})
