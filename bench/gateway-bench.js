'use strict'

const autocannon = require('autocannon')

const query = `query {
  me {
    id
    name
    nickname: name
    topPosts(count: 2) {
      pid
      author {
        id
      }
    }
  }
  topPosts(count: 2) {
    pid
  }
}`

const instance = autocannon(
  {
    url: 'http://localhost:3000/graphql',
    connections: 100,
    title: '',
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-user': 'admin'
    },
    body: JSON.stringify({ query })
  },
  (err) => {
    if (err) {
      console.error(err)
    }
  }
)

process.once('SIGINT', () => {
  instance.stop()
})

autocannon.track(instance, { renderProgressBar: true })
