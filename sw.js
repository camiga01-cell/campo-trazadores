// Service worker: guarda la app en el teléfono para que abra sin internet. Subir VERSION cuando cambie algún archivo.
const VERSION = "campo-v35";
const ARCHIVOS = ["./index.html", "./app.js", "./muestreo.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;          // las teselas del mapa van directo a internet
  const guardada = () => caches.match(e.request, {ignoreSearch: true});
  const red = fetch(e.request, {cache: "no-cache"}).then(r => { if (r && r.ok) { const copia = r.clone(); caches.open(VERSION).then(ca => ca.put(e.request, copia)); } return r; });
  // con internet siempre baja la versión nueva; sin señal (o si tarda más de 4 s) usa la copia guardada
  const limite = new Promise(res => setTimeout(() => guardada().then(c => c ? res(c) : null), 4000));
  e.respondWith(Promise.race([red.catch(() => guardada().then(c => c || Promise.reject())), limite]).catch(() => guardada()));
});
