# mercurius

## Subscriptions

- [Subscriptions](#subscriptions)
  - [Subscription support (simple)](#subscription-support-simple)
  - [Subscription filters](#subscription-filters)
  - [Build a custom GraphQL context object for subscriptions](#build-a-custom-graphql-context-object-for-subscriptions)
  - [Subscription support (with redis)](#subscription-support-with-redis)

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
