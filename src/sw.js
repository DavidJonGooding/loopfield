const CACHE="loopfield-v0.3.0";
const assets=["./","index.html","style.css","config.js","platform.js","renderer.js","engine.js","wav.js","recording-worker.js","icon.png","manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(assets))));
// A waiting update activates on the next visit; it won't reload a live take.
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("loopfield-")&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||new URL(event.request.url).origin!==location.origin)return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});
