# GraphiQL custom plugin

## Quick start

Execute the local `index.js` app to try the GraphiQL plugin integration.

```javascript
// examples/graphiql-plugin
node ./index.js
```

## Create the plugin

You can easily create a GraphiQL plugin and integrate it in Mercurius GraphiQL instance.

* [GraphiQL.](https://github.com/graphql/graphiql)
* [GraphiQL Explorer Plugin example.](https://github.com/graphql/graphiql/tree/main/packages/graphiql-plugin-explorer)

### Plugin component

A GraphiQL plugin is an object that contains these properties:

* `title`: string. The title of the plugin
* `icon`: React component. The icon shown in the toolbar
* `content`: React component with the plugin implementation
 
It can be created using the sample:

```javascript
import React from 'react'

function Content() {
  return (
    <div style={{ maxWidth: '300px' }}>
      <div style={{ height: '100%' }}>This is a sample plugin</div>
    </div>
  )
}

function Icon() {
  return <p>P</p>
}

/* 
 * Enrich, extract or modify the data returned by the GraphiQL fetcher.
 * 
 * Q: Why do I need to intercept the data?
 * A: GraphiQL do not provide a direct access to the fetched data. 
 * The data are fetched and injected directly in the viewer in a stringified format.
 * 
 * To provide a way to access the fetched data a similar function can implemented and passed 
 * to the plugin in the attribute `fetcherWrapper` of the configuration.
 * 
 * {
 *   name: '...',
 *   props: ...,
 *   umdUrl: '...',
 *   fetcherWrapper: 'parseFetchResponse'
 * }
 */   
export function parseFetchResponse(data) {
  if (data) {
    // Eg. storeDataSomewhere(data)
    // Eg. addInfoToData(data)
    // Eg. removeAttributeFromData(data)
  }
  return data
}

export function graphiqlSamplePlugin(props) {
  return {
    title: props.title || 'GraphiQL Sample',
    icon: () => <Icon />,
    content: () => {
      return <Content {...props}/>
    }
  }
}

// This is required for the Mercurius integration
export function umdPlugin(props) {
    return graphiqlSamplePlugin(props)
}
```

### Export as Umd

```javascript
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import jsx from 'rollup-plugin-jsx'

const packageJson = require('./package.json')

const rollup = [
  {
    input: 'src/export.js', // path to the plugin entry point
    output: [
      {
        file: packageJson.main,
        format: 'cjs',
        sourcemap: true
      },
      {
        file: packageJson.module,
        format: 'esm',
        sourcemap: true
      },
      {
        file: packageJson.umd,
        format: 'umd',
        sourcemap: true,
        name: 'mercuriusPluginSample'
      }
    ],
    external: ['react', '@graphiql/toolkit'],
    plugins: [
      resolve({
        extensions: ['.js', '.jsx']
      }),
      svgr(),
      commonjs(),
      jsx({ factory: 'React.createElement' })
    ]
  }
]

export default rollup
```

Check the [plugin-sources](./plugin-sources) folder for a complete example.  

### Serve the plugin

To work with `Mercurius` the plugin should be available using a GET request.

The preferred approach is to deploy the package on a public CDN like [unpkg.com](https://unpkg.com/).

Alternatively it can be served by the local fastify.

```javascript
app.get('/graphiql/samplePlugin.js', (req, reply) => {
    reply.sendFile('samplePlugin.js')
})
```

## Add the plugin to Mercurius

In the configuration file add the plugin in the `graphiql` parameter

```javascript
app.register(mercurius, {
  schema,
  resolvers,
  graphiql: {
    enabled: true,
    plugins: [
      {
        name: 'mercuriusPluginSample',
        props: {title: 'Sample plugin'},
        umdUrl: 'http://localhost:3000/graphiql/samplePlugin.js',
        fetcherWrapper: 'parseFetchResponse'
      }
    ]
  }
})
```

* `name`, string. The same used in the `rollup` export `output(format === umd).name`
* `props`, object. The props to be passed to the plugin 
* `umdUrl`, string. The url of the static `umd` file 
* `fetcherWrapper`, function. The name of an exported function that intercept the result from the fetch. 
