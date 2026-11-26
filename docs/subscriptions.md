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

The CustomPubSub interface allows you to implement a custom publish-subscribe mechanism for GraphQL subscriptions. This gives you complete control over how subscription data is published and delivered.

#### CustomPubSub Interface

To create a custom PubSub implementation, you need to implement a class with at least the following methods:

- **subscribe(topic, queue, ...customArgs)**: 
  - `topic`: String identifier for the subscription topic
  - `queue`: The queue of the subscription: push its events with `queue.push(event)`, see [The subscription queue](#the-subscription-queue)
  - `...customArgs`: Optional additional parameters that can be passed from the subscription resolver
  - Returns: A Promise that resolves when the subscription is set up

- **publish(event, callback)**:
  - `event`: Object containing `topic` and `payload` properties
  - `callback`: Function to be called when the publish operation completes
  - Expected behavior: Emit the payload to subscribers of the topic

The built-in pubsub also accepts `publish(event)` without a callback: it returns
a promise that resolves once the event is delivered, and never rejects. With
`queueOverflow: 'wait'`, that is once the queues that were full have room again.

#### The subscription queue

The queue is not a stream: the pubsub pushes events to it, and the subscription
reads them as an async iterator.

- `queue.push(event)` adds an event without waiting. It returns `false` once the
  queue holds `queueHighWaterMark` events (`queue.highWaterMark`). An event pushed
  to a full queue is handled as `queue.overflow` (the
  [`queueOverflow`](api/options.md#plugin-options) option) says: it is kept with
  `'buffer'` and `'wait'`, it is discarded with `'drop'`, and the subscription
  ends with an error with `'close'`. Once the queue has ended or been destroyed,
  `push()` returns `false` and drops the event.
- `queue.end()`, or `queue.push(null)`, ends the queue: the subscription reads
  the events left, then completes.
- `queue.destroy(error)` ends the subscription now and drops its events. With an
  error, the subscription fails with it.
- `queue.length` is the number of events not read yet.

#### Waiting for queue capacity

Custom pubsubs can opt into backpressure using `queue.waitForCapacity({ signal })`
after `queue.push(event)` returns `false`. `push()` has already handled that
event, as `queue.overflow` says: do not retry it.

`waitForCapacity()` returns a promise that resolves:

- `true` when `queue.length` is below `queue.highWaterMark`;
- `false` when the queue has ended or has been destroyed, even if buffered
  events have not been read yet.

The optional `AbortSignal` cancels only that wait. The promise rejects with
`signal.reason`, and its waiter is removed without closing the queue. An already
aborted signal rejects immediately. All waiters are notified when capacity
returns; this is a notification, not a reservation, so multiple producers must
coordinate their pushes.

For example, an independent producer loop for one subscription can use:

```js
async function deliver (source, queue, signal) {
  for await (const event of source) {
    if (signal.aborted) return
    // once the queue has closed, both return false
    if (!queue.push(event) && !await queue.waitForCapacity({ signal })) return
  }
}
```

Start the producer independently and handle its rejection; do not await its
completion inside `subscribe()`. Subscription setup must finish before GraphQL
can read the queue. Use the subscription's unsubscribe cleanup to stop the
source and abort pending work.

By default (`queueOverflow: 'buffer'`), the built-in pubsub calls back
publishers without waiting for queue capacity, and pushes past the high water
mark still buffer events. With `queueOverflow: 'wait'`, it calls back the
emitter only once `waitForCapacity()` resolves; a custom pubsub that wants
`'wait'` to make publishers wait must do the same when `queue.overflow` is
`'wait'`. With `'drop'` and `'close'`, the queue itself stays bounded. Waiting
in a shared dispatcher can block healthy subscribers behind a slow one;
per-subscription replay or another application policy may be more appropriate.
This API does not bound serialized WebSocket bytes or work already executing in
a resolver.

#### Custom Arguments in subscribe method

The `subscribe` method supports passing custom arguments from your GraphQL resolvers. This allows for additional filtering or configuration at the subscription level. For example, you might pass an `offset` parameter to control where a subscription starts reading from, or pass filter criteria to perform server-side filtering.

Here's an example implementation using Node's EventEmitter:

```js
class CustomPubSub {
  constructor () {
    this.emitter = new EventEmitter()
  }

  async subscribe (topic, queue, offset) {
    const listener = (value) => {
      queue.push(value)
    }

    const close = () => {
      this.emitter.removeListener(topic, listener)
    }

    this.emitter.on(topic, listener)
    queue.close.push(close)
  }

  publish (event, callback) {
    this.emitter.emit(event.topic, event.payload)
    callback()
  }
}

const pubsub = new CustomPubSub()

app.register(mercurius, {
  schema,
  resolvers: {
    Subscription: {
      retrieveItems: {
        subscribe: (root, args, { pubsub }) => pubsub.subscribe('RETRIEVE_ITEMS', args.offset)
      }
    }
  },
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
