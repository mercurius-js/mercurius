/* global fetch:false React:false ReactDOM:false GraphiQL:false */

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
  async function fetcher (params, opts) {
    const res = await fetch(window.GRAPHQL_ENDPOINT, {
      method: 'post',
      headers: {
        ...opts.headers,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params),
      credentials: 'include'
    })

    return res.json()
  }

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
      link.href = 'https://unpkg.com/graphiql@1.4.0/graphiql.css'
      link.type = 'text/css'
      link.rel = 'stylesheet'
      link.media = 'screen,print'
      document.getElementsByTagName('head')[0].appendChild(link)

      return importer.urls([
        'https://unpkg.com/react@16.8.0/umd/react.production.min.js',
        'https://unpkg.com/react-dom@16.8.0/umd/react-dom.production.min.js',
        'https://unpkg.com/graphiql@1.4.0/graphiql.min.js'
      ])
    }).then(render)
} else {
  render()
}
