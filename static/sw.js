/* global fetch:false caches:false self:false */

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open('graphiql-v1').then(function (cache) {
      return cache.addAll([
        './main.js',
        'https://unpkg.com/graphiql@0.12.0/graphiql.css',
        'https://unpkg.com/react@15.6.2/dist/react.min.js',
        'https://unpkg.com/react-dom@15.6.2/dist/react-dom.min.js',
        'https://unpkg.com/graphiql@0.12.0/graphiql.min.js'
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
