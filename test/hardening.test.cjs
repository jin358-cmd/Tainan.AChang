const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('離線授權只接受未到期的志工裝置',()=>{
  const window={};
  vm.runInNewContext(read('offline.js'),{window,Date,indexedDB:undefined});
  const valid={role:'volunteer',offlineAuthorizedUntil:'2026-10-20T00:00:00.000Z'};
  assert.equal(window.AChangOffline.grantValid(valid,Date.parse('2026-10-19T00:00:00.000Z')),true);
  assert.equal(window.AChangOffline.grantValid({...valid,role:'admin'},Date.parse('2026-10-19T00:00:00.000Z')),false);
  assert.equal(window.AChangOffline.grantValid(valid,Date.parse('2026-10-21T00:00:00.000Z')),false);
  assert.equal(window.AChangOffline.grantValid(null),false);
});

test('離線資料庫包含 context、tasks 與 outbox，且佇列按用戶端時間排序',()=>{
  const source=read('offline.js');
  for(const store of ['context','tasks','outbox'])assert.match(source,new RegExp(`createObjectStore\\('${store}'`));
  assert.match(source,/clientCreatedAt\)\.localeCompare\(String\(b\.clientCreatedAt\)\)/);
  assert.match(source,/index\('accountId'\)\.getAll\(accountId\)/);
});
test('Service Worker 快取同源殼層但明確排除 API',()=>{
  const source=read('sw.js');
  for(const asset of ['/hardening.css','/offline.js','/manifest.webmanifest','/data-public.json'])assert.ok(source.includes(`'${asset}'`));
  assert.match(source,/u\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source,/fetch\(e\.request\)\.catch\(\(\)=>caches\.match\(e\.request\)\)/);
});

test('Manifest 圖示檔存在且 PNG 尺寸正確',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display,'standalone');
  const sizeOf=file=>{
    const b=fs.readFileSync(path.join(root,file));
    assert.equal(b.subarray(1,4).toString(),'PNG');
    return [b.readUInt32BE(16),b.readUInt32BE(20)];
  };
  assert.deepEqual(sizeOf('assets/icon-192.png'),[192,192]);
  assert.deepEqual(sizeOf('assets/icon-512.png'),[512,512]);
  assert.deepEqual(manifest.icons.filter(x=>x.type==='image/png').map(x=>x.sizes),['192x192','512x512']);
});

test('公開路線資料具十里、日夜兩時段與來源，且沒有名冊集合',()=>{
  const data=JSON.parse(read('data-public.json'));
  assert.equal(data.areas.length,10);
  assert.equal(data.geo.features.length,10);
  assert.deepEqual([...new Set(data.stops.map(x=>x['時段']))].sort(),['夜間','日間']);
  assert.match(data.source,/Tainan environmental bureau PDFs/);
  assert.equal(Object.hasOwn(data,'members'),false);
  assert.equal(Object.hasOwn(data,'roster'),false);
});

test('UI 呈現 4/4/2 里別分頁、原始排班按鈕、三狀態與離線殼層',()=>{
  const html=read('index.html'),app=read('app.js'),css=read('hardening.css')+read('v04-restore.css');
  for(const id of ['areaPrev','areaNext','areaPageStatus','syncSummary','routeProvenance'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/AREAS\.slice\(0,4\),AREAS\.slice\(4,8\),AREAS\.slice\(8,10\)/);
  assert.match(html,/依車次順序拜訪/);
  assert.match(html,/已排巡點/);
  assert.match(app,/\['待拜訪','進行中','完成'\]/);
  for(const label of ['離線模式','本機保存','連線後需同步'])assert.ok(app.includes(label));
  assert.match(css,/\.action-thin/);
  assert.match(css,/\.compact-action/);
});

test('管理員名冊提供人員授權頁，一般人員個人資料預設唯讀',()=>{
  const html=read('index.html'),app=read('app.js');
  for(const id of ['rosterMainPanel','rosterAuthRefresh','rosterAuthList','workerProfile'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/data-tab="map" class="on">① 地圖<\/button><button data-tab="roster">② 名冊<\/button><button data-tab="members"/);
  assert.match(html,/會員管理/);
  assert.match(app,/canEditProfile=false/);
  assert.match(app,/canEditProfile=role==='volunteer'/);
  assert.match(app,/data-roster-grant/);
  assert.match(html,/href="\/\?entry=volunteer"/);
  assert.match(html,/data-preview-volunteer="1"/);
  assert.match(app,/new URLSearchParams\(location\.search\)/);
  assert.match(app,/匿名示範地址/);
});

test('v0.4 街道地圖基線與離線邊界 fallback 同時保留',()=>{
  const html=read('index.html'),app=read('app.js'),vercel=read('vercel.json');
  assert.match(html,/maplibre-gl@5\.15\.0/);
  assert.match(html,/OpenFreeMap/);
  assert.match(html,/OpenStreetMap contributors/);
  assert.match(app,/tiles\.openfreemap\.org\/styles\/liberty/);
  assert.match(app,/renderMapFallback/);
  assert.match(app,/village-fill/);
  assert.match(vercel,/cdn\.jsdelivr\.net/);
  assert.match(vercel,/tiles\.openfreemap\.org/);
});

test('排班依日夜分流並防止同人同日同時段重複',()=>{
  const app=read('app.js'),api=read('api/tasks.js');
  assert.match(app,/r\['時段'\]===s/);
  assert.match(app,/t\.volunteer_id===p\.id&&t\.visit_date===date&&t\.shift===r\['時段'\]/);
  assert.match(api,/if\(ass\.status===409\)L\.problem\(409/);
});

test('電話顯示為 4-3-3，公開來源不含具名 Owner 帳號或私鑰',()=>{
  const app=read('app.js');
  assert.match(app,/\(\\d\{4\}\)\(\\d\{3\}\)\(\\d\{3\}\)/);
  const publicText=['index.html','app.js','offline.js','data-public.json','manifest.webmanifest','sw.js']
    .map(read).join('\n');
  assert.doesNotMatch(publicText,/jin358@gmail\.com/i);
  assert.doesNotMatch(publicText,/BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/);
  assert.doesNotMatch(publicText,/service[_-]?role/i);
});
// End of hardening checks.
