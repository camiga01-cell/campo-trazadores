// Service worker: guarda la app en el teléfono para que abra sin internet. Subir VERSION cuando cambie algún archivo.
const VERSION = "campo-v24";
const ARCHIVOS = ["./index.html", "./app.js", "./muestreo.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;          // las teselas del mapa van directo a internet
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(c => {
    const red = fetch(e.request).then(r => { if (r && r.ok) { const copia = r.clone(); caches.open(VERSION).then(ca => ca.put(e.request, copia)); } return r; }).catch(() => c);
    return c || red;                                                    // primero lo guardado (sin internet); en segundo plano se actualiza
  }));
});
