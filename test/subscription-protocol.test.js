'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { getProtocolByName, GRAPHQL_WS_PROTOCOL_SIGNALS, GRAPHQL_TRANSPORT_WS_PROTOCOL_SIGNALS } = require('../lib/subscription-protocol')

const cases = [
  {
    defaultProtocol: undefined,
    protocol: undefined,
    expected: undefined
  },
  {
    defaultProtocol: undefined,
    protocol: 'graphql-ws',
    expected: GRAPHQL_WS_PROTOCOL_SIGNALS
  },
  {
    defaultProtocol: undefined,
    protocol: 'graphql-transport-ws',
    expected: GRAPHQL_TRANSPORT_WS_PROTOCOL_SIGNALS
  },
  {
    defaultProtocol: 'graphql-ws',
    protocol: 'graphql-ws',
    expected: GRAPHQL_WS_PROTOCOL_SIGNALS
  },
  {
    defaultProtocol: 'graphql-ws',
    protocol: undefined,
    expected: GRAPHQL_WS_PROTOCOL_SIGNALS
  },
  {
    defaultProtocol: 'graphql-transport-ws',
    protocol: 'graphql-ws',
    expected: GRAPHQL_WS_PROTOCOL_SIGNALS
  },
  {
    defaultProtocol: 'graphql-transport-ws',
    protocol: undefined,
    expected: GRAPHQL_TRANSPORT_WS_PROTOCOL_SIGNALS
  },

]

for (const { defaultProtocol, protocol, expected } of cases) {
  test(`getProtocolByName  returns correct protocol message types for defaultProtocol: ${defaultProtocol} and protocol: ${protocol}`, t => {
    assert.deepStrictEqual(getProtocolByName(protocol, defaultProtocol), expected)
  })
}
