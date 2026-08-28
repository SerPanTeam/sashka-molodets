const CACHE="sashka-molodets-v5";
const BASE=self.registration.scope;
const url=path=>new URL(path,BASE).href;
const CORE=[BASE,url("index.html"),url("styles.css"),url("app.js"),url("pages-shim.js"),url("manifest.webmanifest"),url("icon.svg"),url("content/content.json")];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const requestUrl=new URL(event.request.url);
  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response.ok&&requestUrl.origin===location.origin){
        caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      }
      return response;
    }).catch(()=>caches.match(url("index.html"))))
  );
});
