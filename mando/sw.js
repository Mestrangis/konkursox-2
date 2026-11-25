// Guarda la app para abrirla al instante; la conexión con el portátil siempre va por Ably.
const CACHE = 'konk-mando-v1'
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'vendor/ably.min.js', 'fonts/inter-latin.woff2', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})
// red primero (para recibir actualizaciones), caché si no hay red
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy))
        return r
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  )
})
