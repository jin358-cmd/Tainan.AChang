'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const layer=require('../day-route-layer');
const official=require('../official-routes');
const source=require('../data-official-day-20261030.source.json');
const catalog=require('../data-day-route-locations-20261103.json');
const rows=official.normalize(source,'日間');

test('six complete daytime routes keep all source rows and withhold unverified coordinates after the owner confirms the street',()=>{
 const model=layer.build(rows,catalog);
 assert.equal(model.total,160);assert.equal(model.located,159);
 assert.deepEqual([...model.groups.values()].map(group=>group.length),[50,4,94,4,5,3]);
 assert.deepEqual(model.pending.map(stop=>[stop.route,stop.order,stop.name]),[['日間3',45,'中正三街506號']]);
 assert.match(model.pending[0].notes.join(' '),/地址已由Owner確認為中正三街506號/);
 assert.equal(model.pending[0].status,'地址已確認；座標待定位');
 assert.doesNotMatch(model.pending[0].notes.join(' '),/尚未確認/);
 assert.ok(model.points.features.every(f=>f.geometry.coordinates.every(Number.isFinite)));
});
test('route geometry never bridges an unlocated station or a route boundary',()=>{
 const model=layer.build(rows,catalog,'日間3');
 assert.equal(model.total,94);assert.equal(model.located,93);
 assert.equal(model.lines.features.length,91);
 assert.ok(model.lines.features.every(f=>f.properties.to===f.properties.from+1&&f.properties.route==='日間3'));
 assert.ok(!model.lines.features.some(f=>f.properties.from===44||f.properties.to===45||f.properties.from===45));
});
test('an active admin overlay takes its actual list position and creates a coordinate gap',()=>{
 const extra={'時段':'日間','車次':'日間6','車牌':'AAQ-059','站點ID':'OVERLAY:synthetic','停靠點原文':'大橋一街103巷口','到達':'06:52','離開':'06:54','里別':'大橋里'};
 const original=rows.filter(r=>r['車次']==='日間6'),model=layer.build([original[0],extra,...original.slice(1)],catalog,'日間6');
 assert.equal(model.total,4);assert.equal(model.located,3);
 assert.equal(model.pending[0].order,2);
 assert.deepEqual(model.stops.map(s=>s.order),[1,2,3,4]);
 assert.deepEqual(model.lines.features.map(f=>[f.properties.from,f.properties.to]),[[3,4]]);
 assert.equal(layer.build(original,catalog,'日間6').pending.length,0);
});
test('the verified day6 address fills stop 2 and connects all four stops without reusing a stale address',()=>{
 const original=rows.filter(row=>row['車次']==='日間6');
 const corrected={'時段':'日間','車次':'日間6','車牌':'AAQ-059','站點ID':'OVERLAY:d6000000-0000-4000-8000-000000000001','停靠點原文':'大橋一街228號','到達':'06:52','離開':'06:54','里別':'大橋里'};
 const model=layer.build([original[0],corrected,...original.slice(1)],catalog,'日間6');
 assert.equal(model.stops[1].name,'大橋一街228號');
 assert.equal(model.stops[1].time,'06:52');assert.equal(model.stops[1].end,'06:54');
 assert.equal(model.stops[1].status,'門牌資料比對');
 assert.deepEqual(model.stops[1].position,[120.229396336,23.017772546]);assert.equal(model.located,4);assert.equal(model.pending.length,0);
 assert.deepEqual(model.lines.features.map(f=>[f.properties.from,f.properties.to]),[[1,2],[2,3],[3,4]]);
 assert.deepEqual(model.stops.map(stop=>stop.name),['中華西街196巷2號','大橋一街228號','大橋國小後側門','大橋二街188號旁']);
 const stale=layer.build([{...corrected,'停靠點原文':'大橋一街103巷口'}],catalog,'日間6');
 assert.equal(stale.stops[0].status,'待確認');assert.equal(stale.located,0);
});
test('night and A/B rows stay outside the six-route layer; changed names invalidate old coordinates',()=>{
 const extra=[{'時段':'日間','車次':'A線','站點ID':'ab'},{...rows[0],'時段':'夜間'}];
 assert.equal(layer.build([...rows,...extra],catalog).total,160);
 const changed={...rows[0],'停靠點原文':'不同地址'};
 assert.equal(layer.build([changed],catalog).located,0);
 assert.equal(layer.bounds(layer.build([],catalog)),null);
 const extent=layer.bounds(layer.build(rows,catalog));assert.ok(extent[1][1]>23.049,'northern stations must fit beyond the old ten-village map bounds');
});
test('the route layer is placed above the existing map and cached without changing auth or existing layers',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.ok(html.indexOf('id="mapLayerSettings"')<html.indexOf('id="layerRoutes"'));assert.ok(html.indexOf('id="mapBox"')<html.indexOf('id="layerRoutes"'));
 for(const id of ['layerVolunteer','layerDay','layerNight','mapRouteLayerSelect'])assert.ok(html.includes(`id="${id}"`));
 assert.match(app,/dayMapRouteLayer\?\.sync\(mapLoaded\?map:null\)/);
 assert.match(app,/dayMapRouteLayer\?\.renderFallback\(root\)/);
 for(const asset of ['day-route-layer.js','day-route-layer.css','data-day-route-locations-20261103.json','assets/day-route-basemap.jpg'])assert.ok(sw.includes(asset));
});


test('database location overrides replace the matching ID and preserve every other map location',()=>{
 const original={version:1,stops:[{source_id:'one',source_name:'舊地址',status:'owner_confirmed'},{source_id:'two',source_name:'原有站點'}]};
 const replacement={source_id:'one',source_name:'新地址',status:'address_match',longitude:120.23,latitude:23.02};
 const merged=layer.mergeCatalogOverrides(original,{version:1,stops:[replacement]});
 assert.equal(merged.stops.length,2);assert.deepEqual(merged.stops[0],replacement);assert.deepEqual(merged.stops[1],original.stops[1]);assert.equal(original.stops[0].source_name,'舊地址');
 assert.equal(layer.mergeCatalogOverrides(original,null),original);assert.equal(layer.mergeCatalogOverrides(original,{version:2,stops:[replacement]}),original);
});

test('the public coordinate API reads only the fixed map correction catalog and rejects writes',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'..','api/route-locations.js'),'utf8'),queries=[];
 const payload={version:1,stops:[{source_id:'one',source_name:'大橋一街228號'}]},context={module:{exports:{}},require:name=>{assert.equal(name,'../lib/server');return {run:fn=>fn,method:(req,allowed)=>{if(!allowed.includes(req.method))throw Error('method');},rest:async query=>{queries.push(query);return {data:[{payload}]};},need:r=>r.data,problem:()=>{throw Error('invalid');},json:(res,status,body)=>({status,body})};}};
 vm.runInNewContext(source,context);
 const result=await context.module.exports({method:'GET',query:{catalog_id:'members'}},{});
 assert.equal(result.status,200);assert.equal(result.body,payload);assert.deepEqual(queries,['achang_day_route_catalogs?catalog_id=eq.map_location_overrides&select=payload&limit=1']);
 await assert.rejects(()=>context.module.exports({method:'POST'},{}),/method/);
});


test('address coordinates require recorded exact-match evidence and cannot silently accept an unverified point',()=>{
 const row={'時段':'日間','車次':'日間6','站點ID':'OVERLAY:checked','停靠點原文':'測試地址'};
 const point={source_id:row['站點ID'],source_name:row['停靠點原文'],longitude:120.23,latitude:23.02,status:'address_match'};
 assert.equal(layer.build([row],{stops:[point]},'日間6').located,0);
 assert.equal(layer.build([row],{stops:[{...point,verification:{exact_match:true}}]},'日間6').located,0);
 const verified={...point,verification:{exact_match:true,source_url:'https://data.tainan.gov.tw/example'}};
 assert.equal(layer.build([row],{stops:[verified]},'日間6').located,1);
 assert.equal(layer.build([{...row,'停靠點原文':'不同門牌'}],{stops:[verified]},'日間6').located,0);
});
