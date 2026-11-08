/* global React:false ReactDOM:false GraphiQL:false */

const importer = {
  url: (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.type = 'text/javascript'
      script.src = url
      script.crossOrigin = 'anonymous'
      script.addEventListener('load', () => resolve(script), false)
      script.addEventListener('error', (err) => reject(err), false)
      document.body.appendChild(script)
    })
  },
  urls: (urls) => {
    return Promise.all(urls.map(importer.url))
  }
}

function isAsyncIterable (value) {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

async function * mapAsyncIterable (iterable, map) {
  for await (const value of iterable) {
    yield map(value)
  }
}

// Passes every result, each event of a subscription too, through the
// fetcherWrapper functions of the GraphiQL plugins.
function fetcherWrapper (fetcher, wrappers = []) {
  if (wrappers.length === 0) {
    return fetcher
  }

  const wrap = result => wrappers.reduce((acc, wrapper) => wrapper(acc), result)

  return async (params, options) => {
    const result = await fetcher(params, options)
    return isAsyncIterable(result) ? mapAsyncIterable(result, wrap) : wrap(result)
  }
}

/**
 * Verify if the baseUrl is already present in the first part of GRAPHQL_ENDPOINT url
 * to avoid unexpected duplication of paths
 * @param {string} baseUrl [comes from {@link render} function]
 * @returns boolean
 */
function isDuplicatedUrlArg (baseUrl) {
  const checker = window.GRAPHQL_ENDPOINT.split('/')
  return (checker[1] === baseUrl)
}

function render () {
  const host = window.location.host
  const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  let url = ''
  let subscriptionUrl = ''
  let pathName = window.location.pathname
  if (pathName.startsWith('/')) {
    pathName = pathName.substring(1)
  }
  pathName = pathName.split('/')
  const baseUrl = pathName[0]
  if (baseUrl !== 'graphiql') {
    url = `${window.location.protocol}//${host}/${baseUrl}${window.GRAPHQL_ENDPOINT}`
    subscriptionUrl = `${websocketProtocol}//${host}/${baseUrl}${window.GRAPHQL_ENDPOINT}`
    if (isDuplicatedUrlArg(baseUrl)) {
      url = `${window.location.protocol}//${host}${window.GRAPHQL_ENDPOINT}`
      subscriptionUrl = `${websocketProtocol}//${host}${window.GRAPHQL_ENDPOINT}`
    }
  } else {
    url = `${window.location.protocol}//${host}${window.GRAPHQL_ENDPOINT}`
    subscriptionUrl = `${websocketProtocol}//${host}${window.GRAPHQL_ENDPOINT}`
  }

  const availablePlugins = window.GRAPHIQL_PLUGIN_LIST
    .map(plugin => window[`GRAPHIQL_PLUGIN_${plugin.toUpperCase()}`])
    .filter(pluginData => pluginData && pluginData.umdUrl)

  const fetcherWrapperPlugins = availablePlugins
    .filter(plugin => plugin.fetcherWrapper)
    .map(pluginData => window[pluginData.name][window[`GRAPHIQL_PLUGIN_${pluginData.name.toUpperCase()}`].fetcherWrapper])

  const fetcher = fetcherWrapper(GraphiQL.createFetcher({
    url,
    subscriptionUrl
  }), fetcherWrapperPlugins)

  const plugins = availablePlugins.map(pluginData => window[pluginData.name].umdPlugin(window[`GRAPHIQL_PLUGIN_${pluginData.name.toUpperCase()}`].props))

  ReactDOM.render(
    React.createElement(GraphiQL, {
      fetcher,
      headerEditorEnabled: true,
      shouldPersistHeaders: true,
      plugins
    }),
    document.getElementById('main')
  )
}

function importDependencies () {
  const link = document.createElement('link')
  link.href = 'https://unpkg.com/graphiql@3.8.3/graphiql.min.css'
  link.type = 'text/css'
  link.rel = 'stylesheet'
  link.media = 'screen,print'
  link.crossOrigin = 'anonymous'
  document.getElementsByTagName('head')[0].appendChild(link)

  return importer.urls([
    'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
    'https://unpkg.com/graphiql@3.8.3/graphiql.min.js'
  ]).then(function () {
    const pluginUrls = window.GRAPHIQL_PLUGIN_LIST
      .map(plugin => window[`GRAPHIQL_PLUGIN_${plugin.toUpperCase()}`].umdUrl)
      .filter(url => !!url)

    if (pluginUrls.length) {
      return importer.urls(pluginUrls)
    }
  })
}

if ('serviceWorker' in navigator) {
  navigator
    .serviceWorker
    .register('./graphiql/sw.js')
    .then(importDependencies).then(render)
} else {
  importDependencies()
    .then(render)
}
