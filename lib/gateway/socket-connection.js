'use strict'

const WebSocket = require('ws')

function createClient (url, subscriber, serviceName) {
  const ws = new WebSocket(url, 'graphql-ws')
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8', objectMode: true })
  client.setEncoding('utf8')
  client.write(JSON.stringify({
    type: 'connection_init'
  }))

  client.on('data', async (chunk) => {
    const data = JSON.parse(chunk)
    if (data.type === 'data') {
      await subscriber.publish({
        topic: `${serviceName}_${data.id}`,
        payload: data.payload.data
      })
    }
  })

  return client
}

module.exports = createClient
