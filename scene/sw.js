const CACHE='lifesims-scene-v40';
const FILES=['./','./index.html','./room3d.js','./calendar-style.css','./oura-style.css','./food-log.css','./food-log.js','./oura-sync.js','./privacy.html','./terms.html','./manifest.webmanifest','../icon.svg'];
const ENGINE='https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';
const ENGINE_CORE='https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.core.js';
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE)
  .then(cache=>cache.addAll(FILES.map(path=>new Request(path,{cache:'reload'}))))
  .then(()=>caches.open(CACHE).then(cache=>Promise.all([ENGINE,ENGINE_CORE].map(url=>cache.add(url).catch(()=>{})))))
  .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lifesims-scene-')&&key!==CACHE).map(key=>caches.delete(key)))),
  self.clients.claim()
 ]));
});
self.addEventListener('fetch',event=>{
 const request=event.request, url=new URL(request.url);
 if(request.method==='GET'&&(url.href===ENGINE||url.href===ENGINE_CORE)){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
   return response;
  }).catch(()=>caches.match(request).then(r=>r||Response.error())));
  return;
 }
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Navigation must use the current online HTML, not a stale PWA or HTTP cache copy.
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){
     const copy=response.clone();
     event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./index.html',copy)));
    }
    return response;
   }catch(_){
    return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();
   }
  })());
  return;
 }
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){
   const copy=response.clone();
   event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
  }
  return response;
 }).catch(()=>caches.match(request)));
});
