const CACHE = 'lifesims-room-v1';
const ASSETS = ['./','./index.html','./manifest.webmanifest','../icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).pathname.startsWith(new URL(self.registration.scope).pathname)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request,copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
