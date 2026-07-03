const CACHE_NAME = 'chaos-calendar-shell-v2'
const SHELL_ASSETS = ['/', '/today', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Runtime-cache same-origin GETs as they're fetched — this is what
        // actually makes offline work beyond the fixed shell list above.
        // SHELL_ASSETS alone never covers the hashed JS/CSS bundle files
        // (their names aren't known at service-worker authoring time), so
        // without this, a cached "/today" page would load offline but fail
        // to run because its script/style tags 404 against the Cache API.
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  )
})
