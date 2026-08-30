self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('syncbeat-v1').then((cache) => {
      return cache.addAll(['./index.html']);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
