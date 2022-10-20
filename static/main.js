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

function render () {
  const host = window.location.host

  const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  const url = `${window.location.protocol}//${host}${window.GRAPHQL_ENDPOINT}`
  const subscriptionUrl = `${websocketProtocol}//${host}${window.GRAPHQL_ENDPOINT}`

  const fetcher = GraphiQL.createFetcher({
    url,
    subscriptionUrl
  })

  ReactDOM.render(
    React.createElement(GraphiQL, {
      fetcher,
      headerEditorEnabled: true,
      shouldPersistHeaders: true
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
  ])
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
