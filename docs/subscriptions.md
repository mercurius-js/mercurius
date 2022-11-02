# mercurius

## Subscriptions

- [Subscriptions](#subscriptions)
  - [Subscription support (simple)](#subscription-support-simple)
  - [Subscription filters](#subscription-filters)
  - [Subscription Context](#subscription-context)
  - [Build a custom GraphQL context object for subscriptions](#build-a-custom-graphql-context-object-for-subscriptions)
  - [Subscription support (with redis)](#subscription-support-with-redis)
  - [Subscriptions with custom PubSub](#subscriptions-with-custom-pubsub)
  - [Subscriptions with @fastify/websocket](#subscriptions-with-fastify-websocket)

### Subscription support (simple)

```js
const schema = `
  type Notification {
    id: ID!
    message: String
  }

  type Query {
    notifications: [Notification]
  }

  type Mutation {
    addNotification(message: String): Notification
  }

  type Subscription {
    notificationAdded: Notification
  }
`

let idCount = 1
const notifications = [
  {
    id: idCount,
    message: 'Notification message'
  }
]

const resolvers = {
  Query: {
    notifications: () => notifications
  },
  Mutation: {
    addNotification: async (_, { message }, { pubsub }) => {
      const id = idCount++
      const notification = {
        id,
        message
      }
      notifications.push(notification)
      await pubsub.publish({
        topic: 'NOTIFICATION_ADDED',
        payload: {
          notificationAdded: notification
        }
      })

      return notification
    }
  },
  Subscription: {
    notificationAdded: {
      // You can also subscribe to multiple topics at once using an array like this:
      //  pubsub.subscribe(['TOPIC1', 'TOPIC2'])
      subscribe: async (root, args, { pubsub }) =>
        await pubsub.subscribe('NOTIFICATION_ADDED')
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: true
})
```

### Subscription filters


```js
const schema = `
  type Notification {
    id: ID!
    message: String
  }

  type Query {
    notifications: [Notification]
  }

  type Mutation {
    addNotification(message: String): Notification
  }

  type Subscription {
    notificationAdded(contains: String): Notification
  }
`

let idCount = 1
const notifications = [
  {
    id: idCount,
    message: 'Notification message'
  }
]

const { withFilter } = mercurius

const resolvers = {
  Query: {
    notifications: () => notifications
  },
  Mutation: {
    addNotification: async (_, { message }, { pubsub }) => {
      const id = idCount++
      const notification = {
        id,
        message
      }
      notifications.push(notification)
      await pubsub.publish({
        topic: 'NOTIFICATION_ADDED',
        payload: {
          notificationAdded: notification
        }
      })

      return notification
    }
  },
  Subscription: {
    notificationAdded: {
      subscribe: withFilter(
        (root, args, { pubsub }) => pubsub.subscribe('NOTIFICATION_ADDED'),
        (payload, { contains }) => {
          if (!contains) return true
          return payload.notificationAdded.message.includes(contains)
        }
      )
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: true
})
```

### Subscription Context

The context for the `Subscription` includes:

* `app`, the Fastify application
* `reply`, an object that pretend to be a `Reply` object from Fastify without its decorators.
* `reply.request`, the real request object from Fastify

During the connection initialization phase, all content of proerty `payload` of the `connection_init` packet
is automatically copied inside `request.headers`. In case an `headers` property is specified within `payload`,
that's used instead.

### Build a custom GraphQL context object for subscriptions

```js
...
const resolvers = {
  Mutation: {
    sendMessage: async (_, { message, userId }, { pubsub }) => {
      await pubsub.publish({
        topic: userId,
        payload: message
      })

      return "OK"
    }
  },
  Subscription: {
    receivedMessage: {
      // If someone calls the sendMessage mutation with the Id of the user that was added
      // to the subscription context, that user receives the message.
      subscribe: (root, args, { pubsub, user }) => pubsub.subscribe(user.id)
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: {
      // Add the decoded JWT from the Authorization header to the subscription context.
      context: (_, req) => ({ user: jwt.verify(req.headers["Authorization"].slice(7))})
  }
})
...
```

### Subscription support (with redis)

```js
const redis = require('mqemitter-redis')
const emitter = redis({
  port: 6579,
  host: '127.0.0.1'
})

const schema = `
  type Vote {
    id: ID!
    title: String!
    ayes: Int
    noes: Int
  }

  type Query {
    votes: [Vote]
  }

  type Mutation {
    voteAye(voteId: ID!): Vote
    voteNo(voteId: ID!): Vote
  }

  type Subscription {
    voteAdded(voteId: ID!): Vote
  }
`
const votes = []
const VOTE_ADDED = 'VOTE_ADDED'

const resolvers = {
  Query: {
    votes: async () => votes
  },
  Mutation: {
    voteAye: async (_, { voteId }, { pubsub }) => {
      if (voteId <= votes.length) {
        votes[voteId - 1].ayes++
        await pubsub.publish({
          topic: `VOTE_ADDED_${voteId}`,
          payload: {
            voteAdded: votes[voteId - 1]
          }
        })

        return votes[voteId - 1]
      }

      throw new Error('Invalid vote id')
    },
    voteNo: async (_, { voteId }, { pubsub }) => {
      if (voteId <= votes.length) {
        votes[voteId - 1].noes++
        await pubsub.publish({
          topic: `VOTE_ADDED_${voteId}`,
          payload: {
            voteAdded: votes[voteId - 1]
          }
        })

        return votes[voteId - 1]
      }

      throw new Error('Invalid vote id')
    }
  },
  Subscription: {
    voteAdded: {
      subscribe: async (root, { voteId }, { pubsub }) => {
        // subscribe only for a vote with a given id
        return await pubsub.subscribe(`VOTE_ADDED_${voteId}`)
      }
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: {
    emitter,
    verifyClient: (info, next) => {
      if (info.req.headers['x-fastify-header'] !== 'fastify is awesome !') {
        return next(false) // the connection is not allowed
      }
      next(true) // the connection is allowed
    }
  }
})
```

### Subscriptions with custom PubSub
> Note that when passing both `pubsub` and `emitter` options, `emitter` will be ignored.

```js
class CustomPubSub {
  constructor () {
    this.emitter = new EventEmitter()
  }

  async subscribe (topic, queue) {
    const listener = (value) => {
      queue.push(value)
    }

    const close = () => {
      this.emitter.removeListener(topic, listener)
    }

    this.emitter.on(topic, listener)
    queue.close = close
  }

  publish (event, callback) {
    this.emitter.emit(event.topic, event.payload)
    callback()
  }
}

const pubsub = new CustomPubSub()

app.register(mercurius, {
  schema,
  resolvers,
  subscription: {
    pubsub
  }
})

```

### Subscriptions with @fastify/websocket

Mercurius uses `@fastify/websocket` internally, but you can still use it by registering before `mercurius` plugin. If so, it is recommened to set the appropriate `options.maxPayload` like this:

```js
const fastifyWebsocket = require('@fastify/websocket')

app.register(fastifyWebsocket, {
  options: {
    maxPayload: 1048576
  }
})

app.register(mercurius, {
  schema,
  resolvers,
  subscription: true
})

app.get('/', { websocket: true }, (connection, req) => {
  connection.socket.on('message', message => {
    connection.socket.send('hi from server')
  })
})
```
