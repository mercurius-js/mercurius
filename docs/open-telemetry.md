# mercurius

## OpenTelemetry (Tracing)

Mercurius is fully compatible with open-telemetry

Here is a simple exemple on how to enable tracing on Mercurius with OpenTelemetry and Zipkin:

tracer.js
```js
'use strict'

const api = require('@opentelemetry/api')
const { NodeTracerProvider } = require('@opentelemetry/node')
const { SimpleSpanProcessor } = require('@opentelemetry/tracing')
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin')
const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql')

module.exports = serviceName => {
  const provider = new NodeTracerProvider()
  const graphQLInstrumentation = new GraphQLInstrumentation()
  graphQLInstrumentation.setTracerProvider(provider)
  graphQLInstrumentation.enable()
  provider.addSpanProcessor(
    new SimpleSpanProcessor(
      new ZipkinExporter({
        serviceName
      })
    )
  )
  provider.register()
  return api.trace.getTracer(serviceName)
}
```

gateway.js
```js
const gateway = require('fastify')()
const mercurius = require('mercurius')
const opentelemetry = require('fastify-opentelemetry')

const tracer = require('./tracer')('gateway')
gateway.register(opentelemetry, tracer)
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

await gateway.listen(3000)
```

serviceAdd.js
```js
const service = require('fastify')()
const mercurius = require('mercurius')
const opentelemetry = require('fastify-opentelemetry')
const api = require('@opentelemetry/api')
const meta = require('./package.json')

const tracer = require('./tracer')('service-add')
service.register(opentelemetry, tracer)
service.register(mercurius, {
  schema: `
  extend type Query {
    add(x: Float, y: Float): Float
  }
  `,
  resolvers: {
    Query: {
      add: (_, { x, y }, { tracer }) => {
       const span = tracer.startSpan('customTrace', { parent: tracer.getCurrentSpan() })
       const result = x+y
       span.end()
       return result
      }
    }
  },
  context: () => {
    const tracer = api.trace.getTracer(meta.name, meta.version)
    return { tracer }
  },
  federationMedata: true
})

await service.listen(4001)
```

Start a zipkin service:

```
$ docker run -d -p 9411:9411 openzipkin/zipkin
```

You can know browser through mercurius tracing at `http://localhost:9411`
