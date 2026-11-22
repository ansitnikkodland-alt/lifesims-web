const CACHE='lifesims-scene-v78';
const FILES=['./','./index.html','./room-illustrated-v42.jpg','./calendar-style.css?v=76','./task-premium.css?v=70','./task-premium.js?v=67','./habit-grid.js?v=69','./skill-detail.js?v=76','./focus-timer.js?v=65','./oura-style.css','./food-log.css','./food-log.js','./meal-chat.css','./meal-photo.js','./meal-chat.js','./oura-sync.js','./privacy.html','./terms.html','./manifest.webmanifest','../icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE)
  .then(cache=>cache.addAll(FILES.map(path=>new Request(path,{cache:'reload'}))))
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
 event.respondWith(fetch(request,{cache:(url.pathname.endsWith('.js')||url.pathname.endsWith('.css'))?'no-store':'default'}).then(response=>{
  if(response.ok){
   const copy=response.clone();
   event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
  }
  return response;
 }).catch(()=>caches.match(request,{ignoreSearch:true})));
});
