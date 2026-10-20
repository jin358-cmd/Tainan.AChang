const CACHE = 'achang-pwa-shell-v102';
const SHELL=['./','./index.html','./styles.css','./app.js','./data-public.json','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const req=e.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/api/')||url.pathname.endsWith('/data-private.json'))return;
 const allow=new Set(SHELL.map(p=>new URL(p,self.registration.scope).pathname));if(!allow.has(url.pathname))return;
 if(req.mode==='navigate'){e.respondWith(fetch(req).catch(()=>caches.match('./index.html')));return}
 e.respondWith(caches.match(req,{ignoreSearch:true}).then(x=>x||fetch(req).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(new Request(url.origin+url.pathname),r.clone()));return r})));
});