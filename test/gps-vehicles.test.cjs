'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {normalizePayload,parseReportedAt}=require('../lib/gps-vehicles');

test('official GPS rows normalize timestamps and keep only Yongkang service data',()=>{
 const vehicles=normalizePayload({data:[
  {car:'ABC-1234',linid:'opaque-1',time:'2026-10-28 11:13:10',location:'臺南市永康區 清潔隊',x:'120.272575',y:'23.05725'},
  {car:'ABC-1234',linid:'opaque-2',time:'2026-10-28 11:14:10',location:'臺南市永康區 中正路',x:120.273,y:23.058},
  {car:'OUT-0001',linid:'opaque-3',time:'2026-10-28 11:14:10',location:'臺南市麻豆區',x:120.25,y:23.18},
  {car:'BAD-0001',linid:'opaque-4',time:'bad',location:'臺南市永康區',x:999,y:999}
 ]});
 assert.equal(vehicles.length,1);assert.equal(vehicles[0].id,'ABC-1234');assert.equal(vehicles[0].linid,'opaque-2');
 assert.equal(vehicles[0].reported_at,'2026-10-28T03:14:10.000Z');assert.equal(parseReportedAt('2026-10-28T03:14:10Z'),'2026-10-28T03:14:10.000Z');
});

test('GPS same-origin adapter fetches the fixed official HTTPS JSON endpoint without redirects or cache',async()=>{
 const source=read('api/gps-vehicles.js'),module={exports:{}},calls=[];
 const L={run:fn=>fn,method(req,allowed){assert.deepEqual(allowed,['GET'])},authorized:async()=>({role:'admin'}),json(res,status,body){res.status=status;res.body=body},problem(status,message){throw Object.assign(new Error(message),{status})}};
 const original=global.fetch;global.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify([{car:'ABC-1234',linid:'opaque',time:'2026-10-28 11:13:10',location:'永康區',x:120.272575,y:23.05725}]),{status:200,headers:{'Content-Type':'application/json'}})};
 try{
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:id==='../lib/gps-vehicles'?require('../lib/gps-vehicles'):require(id),module,module.exports);
  const res={};await module.exports({method:'GET',headers:{}},res);assert.equal(res.status,200);assert.equal(res.body.live,true);assert.equal(res.body.count,1);assert.equal(res.body.vehicles[0].id,'ABC-1234');
  assert.equal(calls[0].url,'https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');
 }finally{global.fetch=original}
});

test('GPS layer polls every six minutes, avoids overlaps, pauses hidden tabs, and never fabricates movement',()=>{
 const app=read('app.js'),html=read('index.html'),api=read('api/gps-vehicles.js');
 assert.match(html,/id="layerGps"[^>]*checked/);assert.match(html,/🚛/);assert.match(html,/id="gpsLayerStatus"/);
 assert.match(app,/GPS_REFRESH_MS=360000/);assert.match(app,/if\(gpsRequest\)return gpsRequest/);assert.match(app,/document\.visibilityState==='hidden'/);
 assert.match(app,/保留上次約略位置/);assert.match(app,/資料時間/);assert.match(app,/非導航用途/);
 assert.doesNotMatch(app,/gpsLatestReportedAt\s*=\s*new Date|reported_at\s*=\s*new Date/);
 assert.doesNotMatch(api,/data-gps-snapshot|owner_snapshot/);assert.match(api,/redirect:'error'/);assert.match(api,/AbortController/);
});
