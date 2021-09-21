/* global React:false ReactDOM:false GraphiQL:false SubscriptionsTransportWs: false */

const importer = {
  url: (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.type = 'text/javascript'
      script.src = url
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

  const url = `http://${host}${window.GRAPHQL_ENDPOINT}`
  const subscriptionUrl = `ws://${host}${window.GRAPHQL_ENDPOINT}`

  const fetcher = GraphiQL.createFetcher({
    url,
    legacyClient: new SubscriptionsTransportWs.SubscriptionClient(subscriptionUrl)
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

if ('serviceWorker' in navigator) {
  navigator
    .serviceWorker
    .register('./graphiql/sw.js')
    .then(function () {
      const link = document.createElement('link')
      link.href = 'https://unpkg.com/graphiql@1.4.2/graphiql.css'
      link.type = 'text/css'
      link.rel = 'stylesheet'
      link.media = 'screen,print'
      document.getElementsByTagName('head')[0].appendChild(link)

      return importer.urls([
        'https://unpkg.com/react@16.8.0/umd/react.production.min.js',
        'https://unpkg.com/react-dom@16.8.0/umd/react-dom.production.min.js',
        'https://unpkg.com/graphiql@1.4.2/graphiql.min.js',
        'https://unpkg.com/subscriptions-transport-ws@0.9.19/browser/client.js'
      ])
    }).then(render)
} else {
  render()
}
