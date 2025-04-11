/* global fetch:false caches:false self:false */

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open('graphiql-v3.8.3').then(function (cache) {
      return cache.addAll([
        './main.js',
        'https://unpkg.com/graphiql@3.8.3/graphiql.css',
        'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
        'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
        'https://unpkg.com/graphiql@3.8.3/graphiql.min.js'
      ])
    })
  )
})

self.addEventListener('fetch', function (event) {
  console.log('loading', event.request.url)

  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request)
    }, console.log)
  )
})
