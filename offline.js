(()=>{'use strict';
const DB_NAME='achang-online-offline-v1';
const DB_VERSION=1;
let connection;

function open(){
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{
    if(!('indexedDB'in window))return reject(new Error('此瀏覽器不支援離線資料庫'));
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('context'))db.createObjectStore('context',{keyPath:'accountId'});
      if(!db.objectStoreNames.contains('tasks'))db.createObjectStore('tasks',{keyPath:'accountId'});
      if(!db.objectStoreNames.contains('outbox')){
        const outbox=db.createObjectStore('outbox',{keyPath:'id'});
        outbox.createIndex('accountId','accountId',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('離線資料庫無法開啟'));
  });
  return connection;
}

async function run(store,mode,action){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode);
    const request=action(tx.objectStore(store));
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('離線資料操作失敗'));
    tx.onabort=()=>reject(tx.error||new Error('離線資料交易失敗'));
  });
}

const put=(store,value)=>run(store,'readwrite',s=>s.put(value));
const get=(store,key)=>run(store,'readonly',s=>s.get(key));
const remove=(store,key)=>run(store,'readwrite',s=>s.delete(key));

async function latestContext(){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('context','readonly');
    const req=tx.objectStore('context').getAll();
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)))[0]||null);
    req.onerror=()=>reject(req.error||new Error('離線授權資料讀取失敗'));
  });
}

async function listOutbox(accountId){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('outbox','readonly');
    const req=tx.objectStore('outbox').index('accountId').getAll(accountId);
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>String(a.clientCreatedAt).localeCompare(String(b.clientCreatedAt))));
    req.onerror=()=>reject(req.error||new Error('待同步佇列讀取失敗'));
  });
}

function grantValid(context,now=Date.now()){
  if(!context||context.role!=='volunteer'||!context.offlineAuthorizedUntil)return false;
  const until=Date.parse(context.offlineAuthorizedUntil);
  return Number.isFinite(until)&&until>now;
}

window.AChangOffline={
  grantValid,
  saveContext:context=>put('context',{...context,savedAt:new Date().toISOString()}),
  latestContext,
  removeContext:accountId=>remove('context',accountId),
  saveTasks:(accountId,tasks)=>put('tasks',{accountId,tasks,savedAt:new Date().toISOString()}),
  loadTasks:async accountId=>(await get('tasks',accountId))||null,
  enqueue:event=>put('outbox',{...event,state:event.state||'pending',attempts:event.attempts||0}),
  listOutbox,
  updateEvent:async(id,patch)=>{const old=await get('outbox',id);if(!old)return null;return put('outbox',{...old,...patch})},
  removeEvent:id=>remove('outbox',id)
};
})();
