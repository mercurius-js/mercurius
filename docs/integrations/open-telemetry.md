# mercurius

## OpenTelemetry (Tracing)

Mercurius is compatible with open-telemetry (Note that, for now, jitted requests are not able to trace the graphql execution). Also make sure that registration of opentelemetry instrumentation happens before requiring `mercurius`.

Here is a simple example on how to enable tracing on Mercurius with OpenTelemetry:

tracer.js
```js
'use strict'

const api = require('@opentelemetry/api')
const { NodeTracerProvider } = require('@opentelemetry/node')
const { SimpleSpanProcessor } = require('@opentelemetry/tracing')
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger')
const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql')
const { W3CTraceContextPropagator } = require('@opentelemetry/core')
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin')
// or
// const { JaegerExporter } = require('@opentelemetry/exporter-jaeger')

module.exports = serviceName => {
  const provider = new NodeTracerProvider()
  const graphQLInstrumentation = new GraphQLInstrumentation()
  graphQLInstrumentation.setTracerProvider(provider)
  graphQLInstrumentation.enable()

  api.propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  api.trace.setGlobalTracerProvider(provider)

  provider.addSpanProcessor(
    new SimpleSpanProcessor(
      new ZipkinExporter({
        serviceName
      })
      // or 
      // new JaegerExporter({
      //   serviceName,
      // })
    )
  )
  provider.register()
  return provider
}
```

serviceAdd.js
```js
'use strict'
// Register tracer
const serviceName = 'service-add'
const tracer = require('./tracer')
tracer(serviceName)

const service = require('fastify')({ logger: { level: 'debug' } })
const mercurius = require('mercurius')
const opentelemetry = require('@autotelic/fastify-opentelemetry')

service.register(opentelemetry, { serviceName })
service.register(mercurius, {
  schema: `
  extend type Query {
    add(x: Float, y: Float): Float
  }
  `,
  resolvers: {
    Query: {
      add: (_, { x, y }, { reply }) => {
        const { activeSpan, tracer } = reply.request.openTelemetry()

        activeSpan.setAttribute('arg.x', x)
        activeSpan.setAttribute('arg.y', y)

        const span = tracer.startSpan('compute-add', { parent: tracer.getCurrentSpan() })
        const result = x + y
        span.end()

        return result
      }
    }
  },
})

service.listen({ port: 4001, host: 'localhost' }, err => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
})
```

gateway.js
```js
'use strict'
const serviceName = 'gateway'
const tracer = require('./tracer')
// Register tracer
tracer(serviceName)

const gateway = require('fastify')({ logger: { level: 'debug' } })
const mercurius = require('mercurius')
const opentelemetry = require('@autotelic/fastify-opentelemetry')

// Register fastify opentelemetry
gateway.register(opentelemetry, { serviceName })
gateway.register(mercurius, {
  gateway: {
    services: [
      {
        name: 'add',
        url: 'http://localhost:4001/graphql'
      }
    ]
  }
})

gateway.listen({ port: 3000, host: 'localhost' }, err => {
  if (err) {
    process.exit(1)
  }
})
```

Start a zipkin service:

```
$ docker run -d -p 9411:9411 openzipkin/zipkin
```

Send some request to the gateway: 

```bash
$ curl localhost:3000/graphql -H 'Content-Type: application/json' --data '{"query":"{ add(x: 1, y: 2) }"}'
```

You can now browse through mercurius tracing at `http://localhost:9411`
