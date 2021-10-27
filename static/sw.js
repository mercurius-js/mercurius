/* global fetch:false caches:false self:false */

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open('graphiql-v1.4.0').then(function (cache) {
      return cache.addAll([
        './main.js',
        'https://unpkg.com/graphiql@1.4.2/graphiql.css',
        'https://unpkg.com/react@16.8.0/umd/react.production.min.js',
        'https://unpkg.com/react-dom@16.8.0/umd/react-dom.production.min.js',
        'https://unpkg.com/graphiql@1.4.2/graphiql.min.js',
        'https://unpkg.com/subscriptions-transport-ws@0.9.19/browser/client.js'
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
