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
test('the confirmed day6 address stays attached to its database ID and does not reuse a stale address',()=>{
 const original=rows.filter(row=>row['車次']==='日間6');
 const corrected={'時段':'日間','車次':'日間6','車牌':'AAQ-059','站點ID':'OVERLAY:d6000000-0000-4000-8000-000000000001','停靠點原文':'大橋一街228號','到達':'06:52','離開':'06:54','里別':'大橋里'};
 const model=layer.build([original[0],corrected,...original.slice(1)],catalog,'日間6');
 assert.equal(model.stops[1].name,'大橋一街228號');
 assert.equal(model.stops[1].time,'06:52');assert.equal(model.stops[1].end,'06:54');
 assert.equal(model.stops[1].status,'地址已確認；座標待定位');
 assert.equal(model.stops[1].position,null);
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
