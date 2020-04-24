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
  async function fetcher (params) {
    const res = await fetch(window.GRAPHQL_ENDPOINT, {
      method: 'post',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params),
      credentials: 'include'
    })

    return res.json()
  }

  ReactDOM.render(
    React.createElement(GraphiQL, { fetcher }),
    document.getElementById('main')
  )
}

if ('serviceWorker' in navigator) {
  navigator
    .serviceWorker
    .register('./graphiql/sw.js')
    .then(function () {
      var link = document.createElement('link')
      link.href = 'https://unpkg.com/graphiql@0.12.0/graphiql.css'
      link.type = 'text/css'
      link.rel = 'stylesheet'
      link.media = 'screen,print'
      document.getElementsByTagName('head')[0].appendChild(link)

      return importer.urls([
        'https://unpkg.com/react@15.6.2/dist/react.min.js',
        'https://unpkg.com/react-dom@15.6.2/dist/react-dom.min.js',
        'https://unpkg.com/graphiql@0.12.0/graphiql.min.js'
      ])
    }).then(render)
} else {
  render()
}
