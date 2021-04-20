# Hooks

Hooks are registered with the `fastify.graphql.addHook` method and allow you to listen to specific events in the GraphQL request/response lifecycle. You have to register a hook before the event is triggered, otherwise the event is lost.

By using hooks you can interact directly with the GraphQL lifecycle of Mercurius. There are GraphQL Request and Subscription hooks:

- [GraphQL Request Hooks](#graphql-request-hooks)
  - [preParsing](#preparsing)
  - [preValidation](#prevalidation)
  - [preExecution](#preexecution)
  - [preGatewayExecution](#pregatewayexecution)
  - [onResolution](#onresolution)
  - [Manage Errors from a request hook](#manage-errors-from-a-request-hook)
  - [Add errors to the GraphQL response from a hook](#add-errors-to-the-graphql-response-from-a-hook)
- [GraphQL Subscription Hooks](#graphql-subscription-hooks)
  - [preSubscriptionParsing](#presubscriptionparsing)
  - [preSubscriptionExecution](#presubscriptionexecution)
  - [preGatewaySubscriptionExecution](#pregatewaysubscriptionexecution)
  - [onSubscriptionResolution](#onsubscriptionresolution)
  - [onSubscriptionEnd](#onsubscriptionend)
  - [Manage Errors from a subscription hook](#manage-errors-from-a-subscription-hook)


**Notice:** these hooks are only supported with `async`/`await` or returning a `Promise`.

## GraphQL Request Hooks

It is pretty easy to understand where each hook is executed by looking at the [lifecycle page](/docs/lifecycle.md).<br>

There are five different hooks that you can use in a GraphQL Request *(in order of execution)*:

When registering hooks, you must wait for Mercurius to be registered in Fastify.

```js
await fastify.ready()
```

### preParsing

If you are using the `preParsing` hook, you can access the GraphQL query string before it is parsed. It receives the schema and context objects as other hooks.

For instance, you can register some tracing events:

```js
fastify.graphql.addHook('preParsing', async (schema, source, context) => {
  await registerTraceEvent()
})
```

### preValidation

By the time the `preValidation` hook triggers, the query string has been parsed into a GraphQL Document AST.

```js
fastify.graphql.addHook('preValidation', async (schema, document, context) => {
  await asyncMethod()
})
```

### preExecution

In the `preExecution` hook, you can modify the following items by returning them in the hook definition:
  - `document`
  - `errors`

```js
fastify.graphql.addHook('preExecution', async (schema, document, context) => {
  const { modifiedDocument, errors } = await asyncMethod(document)

  return {
    document: modifiedDocument
    errors
  }
})
```

### preGatewayExecution

In the `preGatewayExecution` hook, you can modify the following items by returning them in the hook definition:
  - `document`
  - `errors`

This hook will only be triggered in gateway mode. When in gateway mode, each hook definition will trigger multiple times in a single request just before executing remote GraphQL queries on the federated services.

Note, this hook contains service metadata in the `service` parameter:
- `name`: service name

```js
fastify.graphql.addHook('preGatewayExecution', async (schema, document, context, service) => {
  const { modifiedDocument, errors } = await asyncMethod(document)

  return {
    document: modifiedDocument
    errors
  }
})
```

### onResolution

```js
fastify.graphql.addHook('onResolution', async (execution, context) => {
  await asyncMethod()
})
```

### Manage Errors from a request hook
If you get an error during the execution of your hook, you can just throw an error and Mercurius will automatically close the GraphQL request and send the appropriate errors to the user.`

**Notice:** there is one exception to this with the `preGatewayExecution` hook, which will continue execution of the rest of the query and append the error to the errors array in the response.

```js
fastify.graphql.addHook('preParsing', async (schema, source, context) => {
  throw new Error('Some error')
})
```

### Add errors to the GraphQL response from a hook

The following hooks support adding errors to the GraphQL response. These are:

 - `preExecution`
 - `preGatewayExecution`

```js
fastify.graphql.addHook('preExecution', async (schema, document, context) => {
  return {
    errors: [new Error('foo')]
  }
})

fastify.graphql.addHook('preExecution', async (schema, document, context) => {
  return {
    errors: [new Error('bar')]
  }
})
```

Note, the original query will still execute. Adding the above will result in the following response:

```json
{
  "data": {
    foo: "bar"
  },
  "errors": [
    {
      "message": "foo"
    },
    {
      "message": "bar"
    }
  ]
}
```

## GraphQL Subscription Hooks

It is pretty easy to understand where each hook is executed by looking at the [lifecycle page](/docs/lifecycle.md).<br>

There are five different hooks that you can use in GraphQL Subscriptions *(in order of execution)*:

When registering hooks, you must make sure that subscriptions are enabled and you must wait for Mercurius to be registered in Fastify.

```js
await fastify.ready()
```

### preSubscriptionParsing

If you are using the `preSubscriptionParsing` hook, you can access the GraphQL subscription query string before it is parsed. It receives the schema and context objects as other hooks.

For instance, you can register some tracing events:

```js
fastify.graphql.addHook('preSubscriptionParsing', async (schema, source, context) => {
  await registerTraceEvent()
})
```

### preSubscriptionExecution

By the time the `preSubscriptionExecution` hook triggers, the subscription query string has been parsed into a GraphQL Document AST.

```js
fastify.graphql.addHook('preSubscriptionExecution', async (schema, document, context) => {
  await asyncMethod()
})
```

### preGatewaySubscriptionExecution

This hook will only be triggered in gateway mode. When in gateway mode, each hook definition will trigger when creating a subscription with a federated service.

Note, this hook contains service metadata in the `service` parameter:
- `name`: service name

```js
fastify.graphql.addHook('preGatewaySubscriptionExecution', async (schema, document, context, service) => {
  await asyncMethod()
})
```

### onSubscriptionResolution

```js
fastify.graphql.addHook('onSubscriptionResolution', async (execution, context) => {
  await asyncMethod()
})
```

### onSubscriptionEnd

This hook will be triggered when a subscription ends.

```js
fastify.graphql.addHook('onSubscriptionEnd', async (context) => {
  await asyncMethod()
})
```

### Manage Errors from a subscription hook

If you get an error during the execution of your subscription hook, you can just throw an error and Mercurius will send the appropriate errors to the user along the websocket.`

**Notice:** there are exceptions to this with the `onSubscriptionResolution` and `onSubscriptionEnd` hooks, which will close the subscription connection if an error occurs.

```js
fastify.graphql.addHook('preSubscriptionParsing', async (schema, source, context) => {
  throw new Error('Some error')
})
```

## GraphQL Application lifecycle Hooks

There is one hook that you can use in a GraphQL application.

When registering hooks, you must wait for Mercurius to be registered in Fastify.

```js
await fastify.ready()
```

### onGatewayReplaceSchema

When the Gateway service obtains new versions of federated schemas within a defined polling interval, the `onGatewayReplaceSchema` hook will be triggered every time a new schema is built. It is called just before the old schema is replaced with the new one.

This hook will only be triggered in gateway mode. It has the following parameters:

 - `instance` - The gateway server `FastifyInstance` (this contains the old schema).
 - `schema` - The new schema that has been built from the gateway refresh.

```js
fastify.graphql.addHook('onGatewayReplaceSchema', async (instance, schema) => {
  await someSchemaTraversalFn()
})
```

If this hook throws, the error will be caught and logged using the `FastifyInstance` logger. Subsequent `onGatewayReplaceSchema` hooks that are registered will not be run for this interval.
