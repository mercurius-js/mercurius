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

// The functions above are required to wrap the fetcher and access/enrich the data returned by the GQL query
// Except `fetcherWrapper`, they are copy/pasted directly from the `graphiql` codebase.

function observableToPromise (observable) {
  return new Promise((resolve, reject) => {
    const subscription = observable.subscribe({
      next: v => {
        resolve(v)
        subscription.unsubscribe()
      },
      error: reject,
      complete: () => {
        reject(new Error('no value resolved'))
      }
    })
  })
}

function isObservable (value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'subscribe' in value &&
    typeof value.subscribe === 'function'
  )
}

function isAsyncIterable (input) {
  return (
    typeof input === 'object' &&
    input !== null &&
    ((input)[Symbol.toStringTag] === 'AsyncGenerator' ||
      Symbol.asyncIterator in input)
  )
}

function asyncIterableToPromise (
  input
) {
  return new Promise((resolve, reject) => {
    const iteratorReturn = (
      'return' in input ? input : input[Symbol.asyncIterator]()
    ).return?.bind(input)
    const iteratorNext = (
      'next' in input ? input : input[Symbol.asyncIterator]()
    ).next.bind(input)

    iteratorNext()
      .then(result => {
        resolve(result.value)
        // ensure cleanup
        iteratorReturn?.()
      })
      .catch(err => {
        reject(err)
      })
  })
}

function fetcherReturnToPromise (fetcherResult) {
  return Promise.resolve(fetcherResult).then(result => {
    if (isAsyncIterable(result)) {
      return asyncIterableToPromise(result)
    } else if (isObservable(result)) {
      return observableToPromise(result)
    }
    return result
  })
}

function fetcherWrapper (fetcher, cbs = []) {
  return async (gqlp, fetchOpt) => {
    const fetchResponse = await fetcher(gqlp, fetchOpt)
    const result = await fetcherReturnToPromise(fetchResponse)
    return cbs.reduce((acc, cb) => cb(acc), result)
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
    .map(plugin => window[`GRAPIHQL_PLUGIN_${plugin.toUpperCase()}`])
    .filter(pluginData => pluginData && pluginData.umdUrl)

  const fetcherWrapperPlugins = availablePlugins
    .filter(plugin => plugin.fetcherWrapper)
    .map(pluginData => window[pluginData.name][window[`GRAPIHQL_PLUGIN_${pluginData.name.toUpperCase()}`].fetcherWrapper])

  const fetcher = fetcherWrapper(GraphiQL.createFetcher({
    url,
    subscriptionUrl
  }), fetcherWrapperPlugins)

  const plugins = availablePlugins.map(pluginData => window[pluginData.name].umdPlugin(window[`GRAPIHQL_PLUGIN_${pluginData.name.toUpperCase()}`].props))

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
  link.href = 'https://unpkg.com/graphiql@2.0.9/graphiql.min.css'
  link.type = 'text/css'
  link.rel = 'stylesheet'
  link.media = 'screen,print'
  link.crossOrigin = 'anonymous'
  document.getElementsByTagName('head')[0].appendChild(link)

  return importer.urls([
    'https://unpkg.com/react@18.2.0/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js',
    'https://unpkg.com/graphiql@2.0.9/graphiql.min.js'
  ]).then(function () {
    const pluginUrls = window.GRAPHIQL_PLUGIN_LIST
      .map(plugin => window[`GRAPIHQL_PLUGIN_${plugin.toUpperCase()}`].umdUrl)
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
