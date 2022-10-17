# Graphiql custom plugin

You can easily create a graphiql plugin and integrate it in mercurius graphiql instance.

[More info here.](https://github.com/graphql/graphiql)

[GraphiQL Explorer Plugin example.](https://github.com/graphql/graphiql/tree/main/packages/graphiql-plugin-explorer)

## Create the plugin

### Plugin component

A Graphiql plugin is an object that exports three values:

* title: string. The title of the plugin
* icon: React component. The icon shown in the toolbar
* content: React component with the plugin implementation
 
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
  return <p>GE</p>
}

export function parseFetchResponse(data) {
  if (data.data) {
    // Do something with the data returned by the fetch
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

// This is required for the mercurius integration
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

### Serve the plugin

To work with `mercurius` the plugin should be available using a GET request. 
It can be served by the local fastify

```javascript
app.get('/graphiql/samplePlugin.js', (req, reply) => {
    reply.sendFile('samplePlugin.js')
})
```

or it can be deployed on a public CDN like [unpkg.com](https://unpkg.com/)

## Add the plugin to mercurius

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

* name, string. The same used in the `rollup` export `output(format === umd).name`
* props, object. The props to be passed to the plugin 
* umdUrl, string. The url of the static `umd` file 
* fetcherWrapper, function. The name of an exported function that intercept the result from the fetch. 
