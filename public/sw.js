const CACHE="sashka-molodets-v17";
const BASE=self.registration.scope;
const url=path=>new URL(path,BASE).href;
const CORE=[BASE,url("index.html"),url("styles.css"),url("enhancements.css"),url("admin-status.css"),url("app.js"),url("admin-status.js"),url("pages-shim.js"),url("audio-bridge.js"),url("object-sfx.js"),url("object-sfx-local.js"),url("manifest.webmanifest"),url("icon.svg"),url("content/content.json")];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

const isMutable=requestUrl=>{
  const p=requestUrl.pathname;
  return p.includes("/content/") ||
    p.includes("/assets/generated/") ||
    p.includes("/assets/sfx/") ||
    /\/(?:index\.html|app\.js|pages-shim\.js|audio-bridge\.js|object-sfx\.js|object-sfx-local\.js|admin-status\.js|sw\.js)$/.test(p);
};

async function networkFirst(request){
  const requestUrl=new URL(request.url);
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(response.ok&&requestUrl.origin===location.origin){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }catch{
    const cached=await caches.match(request);
    if(cached)return cached;
    if(request.mode==="navigate")return caches.match(url("index.html"));
    throw new Error("Network unavailable and asset is not cached");
  }
}

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const requestUrl=new URL(event.request.url);
  if(event.request.mode==="navigate" || isMutable(requestUrl)){
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok&&requestUrl.origin===location.origin)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
    return response;
  })));
});
