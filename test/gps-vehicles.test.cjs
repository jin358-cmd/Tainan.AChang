'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {normalizePayload,parseReportedAt,inYongkangDistrict,extractOfficialResourcePayload}=require('../lib/gps-vehicles');

test('official GPS rows normalize timestamps and keep only Yongkang service data',()=>{
 const vehicles=normalizePayload({data:[
  {car:'ABC-1234',linid:'opaque-1',time:'2026-10-28 11:13:10',location:'臺南市永康區 清潔隊',x:'120.272575',y:'23.05725'},
  {car:'ABC-1234',linid:'opaque-2',time:'2026-10-28 11:14:10',location:'臺南市永康區 中正路',x:120.273,y:23.058},
  {car:'OUT-0001',linid:'opaque-3',time:'2026-10-28 11:14:10',location:'臺南市麻豆區',x:120.25,y:23.18},
  {car:'KER-2163',linid:'opaque-5',time:'2026-10-28 11:15:10',location:'永康焚化廠',x:120.283607,y:23.040127},
  {car:'BAD-0001',linid:'opaque-4',time:'bad',location:'臺南市永康區',x:999,y:999}
 ]});
 assert.equal(vehicles.length,2);assert.equal(vehicles[0].id,'ABC-1234');assert.equal(vehicles[0].linid,'opaque-2');assert.equal(vehicles[1].id,'KER-2163');
 assert.equal(vehicles[0].reported_at,'2026-10-28T03:14:10.000Z');assert.equal(parseReportedAt('2026-10-28T03:14:10Z'),'2026-10-28T03:14:10.000Z');assert.equal(inYongkangDistrict(120.283607,23.040127),false,'named Yongkang facilities just outside the boundary are retained by official location text');assert.equal(inYongkangDistrict(120.25,23.18),false);
});

test('GPS same-origin adapter fetches the fixed official HTTPS JSON endpoint without redirects or cache',async()=>{
 const source=read('api/gps-vehicles.js'),module={exports:{}},calls=[];
 const L={run:fn=>fn,method(req,allowed){assert.deepEqual(allowed,['GET'])},authorized:async()=>({role:'admin'}),json(res,status,body){res.status=status;res.body=body},problem(status,message){throw Object.assign(new Error(message),{status})}};
 const original=global.fetch;global.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify([{car:'ABC-1234',linid:'opaque',time:'2026-10-28 11:13:10',location:'永康區',x:120.272575,y:23.05725}]),{status:200,headers:{'Content-Type':'application/json'}})};
 try{
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:id==='../lib/gps-vehicles'?require('../lib/gps-vehicles'):require(id),module,module.exports);
  const res={};await module.exports({method:'GET',headers:{}},res);assert.equal(res.status,200);assert.equal(res.body.live,true);assert.equal(res.body.count,1);assert.equal(res.body.vehicles[0].id,'ABC-1234');assert.equal(res.body.source_mode,'official_json_api');
  assert.equal(calls[0].url,'https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');
 }finally{global.fetch=original}
});

test('official Resource HTML fallback accepts only embedded verifiable vehicle JSON',async()=>{
 const rows=extractOfficialResourcePayload('<html><script type="application/json">{"records":[{"car":"KER-2163","linid":"opaque","time":"2026-10-28 14:30:00","location":"永康焚化廠","x":120.283607,"y":23.040127}]}</script></html>');
 assert.equal(rows.length,1);assert.equal(rows[0].car,'KER-2163');
 assert.throws(()=>extractOfficialResourcePayload('<html><p>沒有車輛資料</p></html>'),/未包含可驗證/);
 const source=read('api/gps-vehicles.js'),module={exports:{}},calls=[];
 const L={run:fn=>fn,method(){},authorized:async()=>({role:'admin'}),json(res,status,body){res.status=status;res.body=body},problem(status,message){throw Object.assign(new Error(message),{status})}};
 const original=global.fetch;global.fetch=async(url,options)=>{calls.push({url,options});if(calls.length===1)throw Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});return new Response('<html><pre>[{&quot;car&quot;:&quot;KER-2163&quot;,&quot;linid&quot;:&quot;opaque&quot;,&quot;time&quot;:&quot;2026-10-28 14:30:00&quot;,&quot;location&quot;:&quot;永康焚化廠&quot;,&quot;x&quot;:120.283607,&quot;y&quot;:23.040127}]</pre></html>',{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}})};
 try{
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:id==='../lib/gps-vehicles'?require('../lib/gps-vehicles'):require(id),module,module.exports);
  const res={};await module.exports({method:'GET',headers:{}},res);assert.equal(res.status,200);assert.equal(res.body.source_mode,'official_resource_page_fallback');assert.equal(res.body.count,1);assert.equal(calls[1].url,'https://data.tainan.gov.tw/Resource/2c8a70d5-06f2-4353-9e92-c40d33bcd969');assert.equal(calls[1].options.redirect,'error');
 }finally{global.fetch=original}
});

test('GPS adapter keeps the timeout active until the response body is fully read',async()=>{
 const source=read('api/gps-vehicles.js');
 assert.match(source,/UPSTREAM_TIMEOUT_MS=12000/);assert.match(read('vercel.json'),/"api\/gps-vehicles\.js"[\s\S]*"maxDuration": 30/);
 assert.ok(source.indexOf('raw=await upstream.text()')<source.indexOf('finally{clearTimeout(timer)}'));
 const module={exports:{}},L={run:fn=>fn,method(){},authorized:async()=>({role:'admin'}),json(){},problem(status,message){throw Object.assign(new Error(message),{status})}};
 const original=global.fetch;global.fetch=async()=>({ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>{throw Object.assign(new Error('aborted'),{name:'AbortError'})}});
 try{vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:id==='../lib/gps-vehicles'?require('../lib/gps-vehicles'):require(id),module,module.exports);await assert.rejects(()=>module.exports({method:'GET',headers:{}},{}),error=>error.status===503&&/目前無法連線/.test(error.message))}finally{global.fetch=original}
});

test('GPS adapter emits bounded non-sensitive timing telemetry for success and failure',()=>{
 const source=read('api/gps-vehicles.js');
 assert.match(source,/GPS upstream source failed/);assert.match(source,/error_stage/);assert.match(source,/upstream_status/);assert.match(source,/content_type/);assert.match(source,/elapsed_ms/);assert.match(source,/timed_out/);assert.match(source,/cause_code/);
 assert.match(source,/GPS upstream fetch completed/);assert.match(source,/upstream_status/);assert.match(source,/normalized_count/);
 assert.doesNotMatch(source,/console\.(?:info|warn)\([^\n]*(?:raw|payload|authorization|token)/i);
});

test('GPS layer is hidden and runtime polling is disabled while rollback adapter remains available',()=>{
 const app=read('app.js'),html=read('index.html'),api=read('api/gps-vehicles.js');
 assert.doesNotMatch(html,/id="layerGps"/);assert.doesNotMatch(html,/id="gpsLayerStatus"/);assert.doesNotMatch(html,/>垃圾車<\/label>/);
 assert.doesNotMatch(app,/onlineApi\('gps-vehicles'\)/);assert.doesNotMatch(app,/gpsToggle\.onchange|loadGpsVehicles|scheduleGpsRefresh|startGpsRefresh/);
 assert.doesNotMatch(app,/垃圾車 GPS 更新失敗|官方 GPS 約略位置|非導航用途/);
 assert.doesNotMatch(api,/data-gps-snapshot|owner_snapshot/);assert.match(api,/redirect:'error'/);assert.match(api,/AbortController/);
});

test('failed authenticated startup stops GPS polling before returning to logged-out UI',()=>{
 const app=read('app.js');
 assert.match(app,/async function authStart\(\)\{try\{[\s\S]*?\}catch\(e\)\{stopGpsRefresh\(\);showAuth\(\)/);
});
