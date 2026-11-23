const CACHE='lifesims-scene-v120';
const FILES=['./','./index.html','./family.css?v=119','./family.js?v=120','./cloud-family.css?v=120','./cloud-family.js?v=120','./room-illustrated-v42.jpg','./calendar-style.css?v=76','./task-premium.css?v=92','./task-premium.js?v=112','./habit-grid.js?v=112','./skill-detail.js?v=112','./focus-timer.js?v=65','./oura-style.css','./food-log.css','./food-log.js','./meal-chat.css?v=90','./meal-live-camera.css?v=93','./meal-photo.js?v=93','./meal-chat.js?v=93','./meal-lookup.js?v=89','./meal-live-camera.js?v=93','./health-cycle-medications.css?v=106','./health-cycle-medications.js?v=112','./mood-picker.js?v=107','./pets.css?v=111','./pets.js?v=113','./screen-time-links.js?v=118','./screen-time-report.js?v=118','./screen-time-report.css?v=118','./stayfree-import.js?v=118','./android-usage-sync.js?v=118','./stayfree-import.css?v=118','./pets-realistic-atlas-v110.webp?v=110','./oura-sync.js','./privacy.html','./terms.html','./manifest.webmanifest','../icon.svg'];
self.addEventListener('install',event=>{
 // One obsolete/missing asset must not block a new service worker and leave
 // the entire installed PWA stuck on an older application version.
 event.waitUntil(caches.open(CACHE)
  .then(cache=>Promise.all(FILES.map(path=>
   cache.add(new Request(path,{cache:'reload'})).catch(()=>null))))
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
 }).catch(()=>caches.match(request)));
});
