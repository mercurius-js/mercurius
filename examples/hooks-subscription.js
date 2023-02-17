'use strict'

const Fastify = require('fastify')
const mq = require('mqemitter')
const mercurius = require('..')

async function start () {
  const app = Fastify()

  const schema = `
    type Notification {
      id: ID!
      message: String
    }

    type Mutation {
      addNotification(message: String): Notification
    }

    type Subscription {
      notificationAdded: Notification
    }
  `

  const emitter = mq()

  const resolvers = {
    Mutation: {
      addNotification: async (_, { message }) => {
        const notification = {
          id: 1,
          message
        }
        await emitter.emit({
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
        subscribe: (root, args, { pubsub }) => pubsub.subscribe('NOTIFICATION_ADDED')
      }
    }
  }

  app.register(mercurius, {
    schema,
    resolvers,
    subscription: {
      emitter
    }
  })

  await app.ready()

  app.graphql.addHook('preSubscriptionParsing', async function (schema, source, context) {
    console.log('preSubscriptionParsing called')
  })

  app.graphql.addHook('preSubscriptionExecution', async function (schema, document, context) {
    console.log('preSubscriptionExecution called')
  })

  app.graphql.addHook('onSubscriptionResolution', async function (execution, context) {
    console.log('onSubscriptionResolution called')
  })

  app.graphql.addHook('onSubscriptionEnd', async function (context, id) {
    console.log('onSubscriptionEnd called')
  })

  await app.listen({ port: 3000 })
}

start()
