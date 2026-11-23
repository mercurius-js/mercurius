/* global fetch:false caches:false self:false */

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open('graphiql-v3.8.3').then(function (cache) {
      return cache.addAll([
        './main.js',
        './graphiql.min.css',
        './react.production.min.js',
        './react-dom.production.min.js',
        './graphiql.min.js'
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
