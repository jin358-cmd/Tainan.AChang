'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const layer=require('../day-route-layer'),official=require('../official-routes'),progress=require('../dispatch-view');
const day=official.normalize(require('../data-official-day-20261030.source.json'),'日間'),night=official.normalize(require('../data-official-night-20261030.source.json'),'夜間');
const nightCatalog=require('../data-night-route-locations-20261103.json');
const catalog={...require('../data-day-route-locations-20261103.json'),stops:[...require('../data-day-route-locations-20261103.json').stops,...nightCatalog.stops]};
test('all 24 nighttime routes retain source order and withhold conflicting coordinates',()=>{
 const model=layer.build([...day,...night],catalog,'night-all');
 assert.equal(model.groups.size,24);assert.equal(model.total,1625);assert.equal(model.located,1603);assert.equal(model.pending.length,22);
 assert.deepEqual([...model.groups.keys()],[...new Set(night.map(r=>r.車次))]);
 assert.equal(new Set(model.stops.map(s=>s.color)).size,24);
 for(const [route,stops] of model.groups){assert.equal(stops.length,night.filter(r=>r.車次===route&&!r.來源刪除線).length);assert.ok(stops.some(s=>s.position));}
 assert.equal(model.stops.find(s=>s.id==='PDF:NIGHT:0379').name,'中山南路614號');
 assert.equal(model.stops.find(s=>s.id==='PDF:NIGHT:0379').position,null);
 assert.equal(layer.build([...day,...night],catalog).total,160);
 assert.equal(layer.build([...day,...night],catalog,'all-routes').groups.size,30);
});
test('nighttime selection and printing share the inclusive window without jumping deleted or missing stations',()=>{
 const full=layer.build(night,catalog,'夜間40'),selected=layer.filterModelWindow(full,'16:30','18:30');
 assert.ok(!full.stops.some(s=>s.id==='PDF:NIGHT:1563'));
 assert.equal(full.stops.find(s=>s.id==='PDF:NIGHT:1564').order,7);
 assert.ok(!full.lines.features.some(f=>f.properties.from===5&&f.properties.to===7));
 assert.ok(selected.stops.length>0&&selected.stops.every(s=>s.time>='16:30'&&s.time<='18:30'));
 for(const line of selected.lines.features){assert.equal(line.properties.to,line.properties.from+1);assert.ok(selected.stops.some(s=>s.order===line.properties.from));assert.ok(selected.stops.some(s=>s.order===line.properties.to));}
 const print=require('../route-print-map').filterByIds(selected,selected.stops.map(s=>s.id));assert.equal(print.total,selected.total);assert.equal(print.points.features.length,selected.located);
});
test('each eligible nighttime vehicle has its own next station at Taiwan local time',()=>{
 const model=layer.build(night,catalog,'night-all'),now=new Date('2026-11-03T08:00:00Z');
 const ids=layer.nextStopIds(model,night,progress,now),byId=new Map(night.map(r=>[r.站點ID,r]));
 assert.equal(ids.size,24);assert.equal(new Set([...ids].map(id=>byId.get(id).車次)).size,24);
 for(const id of ids){assert.ok(progress.runsToday(byId.get(id),now));assert.ok(byId.get(id).到達>='16:00');}
});
// Exercise the production controller with actual source data, including menu/shift synchronization and map paints.
test('night menu synchronizes shift, paints yellow waves, and station detail omits validation notes',async()=>{
 const nodes=new Map(),events=new Map(),timers=[],sources=new Map(),layers=new Map(),paints=[];let controller;
 class Node{constructor(){this.value='';this.checked=true;this.hidden=false;this.children=[];this.style={};this.clientWidth=780;this.clientHeight=640;}setAttribute(){}append(...x){this.children.push(...x);}prepend(...x){this.children.unshift(...x);}replaceChildren(...x){this.children=x;}addEventListener(k,v){this[k]=v;}querySelector(){return new Node();}remove(){}dispatchEvent(e){this[e.type]?.(e);}}
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 node('mapRouteLayerSelect').value='all';node('shift').value='日間';node('directoryStartTime').value='06:15';node('directoryEndTime').value='07:50';
 const map={getSource:id=>sources.get(id),addSource:(id,value)=>sources.set(id,{...value,setData(data){this.data=data;}}),addLayer:layer=>layers.set(layer.id,layer),getLayer:id=>layers.get(id),setLayoutProperty(){},setPaintProperty:(...x)=>paints.push(x),setMaxBounds(){},fitBounds(){},on:(type,id,handler)=>{if(type==='click')events.set(id,handler);},getCanvas:()=>({style:{}})};
 const document={hidden:false,getElementById:id=>id==='mapFallback'?null:node(id),createElement:()=>new Node(),createTextNode:text=>({textContent:text}),addEventListener:(type,fn)=>events.set(type,fn)};
 const window={AChangMemberCards:require('../member-cards'),AChangDispatchView:progress,AChangRouteDirectory:{setShift(shift){node('shift').value=shift;events.get('achang:route-time-filter')({detail:{shift,start:'16:30',end:'18:30'}});}}};
 const context=vm.createContext({document,window,console,Date,Event:class{constructor(type){this.type=type;}},setInterval:fn=>timers.push(fn),fetch:async file=>({ok:true,json:async()=>file.includes('night')?nightCatalog:require('../data-day-route-locations-20261103.json')})});
 vm.runInContext(fs.readFileSync(require.resolve('../day-route-layer.js'),'utf8'),context);
 controller=context.AChangDayRouteLayer.create({getRows:()=>[...day,...night],getStaffing:()=>({date:'2026-11-03',people:[{id:'fixture-regular',name:'一般志工',phone:'0911111111',leader:false},{id:'fixture-person',name:'測試志工',phone:'0912345678',leader:true}]}),onChange:()=>controller?.sync(map)});
 await new Promise(resolve=>setImmediate(resolve));controller.sync(map);
 node('mapRouteLayerSelect').value='夜間2';node('mapRouteLayerSelect').change();
 assert.equal(node('shift').value,'夜間');assert.equal(node('mapRouteLayerSelect').value,'夜間2');
 const points=sources.get('achang-day-routes-points').data.features;
 assert.ok(points.length>0);assert.ok(points.every(f=>f.properties.route==='夜間2'));
 assert.equal(layers.get('day-route-next-core').paint['circle-color'],'#fff34d');
 assert.equal(layers.get('day-route-next-ring-1').paint['circle-stroke-color'],'#ffcc00');
 timers[1]();assert.ok(paints.some(x=>x[0]==='day-route-next-ring-0'&&x[1]==='circle-radius'));
 events.get('day-route-points')({features:[points[0]]});
 const detail=node('mapBox').children.at(-1);assert.equal(detail.children.length,5);const address=detail.children.find(x=>x.className==='day-route-address-line'),navigation=address.children.find(x=>x.className==='day-route-navigate');assert.ok(navigation.href.startsWith('https://www.google.com/maps/dir/?api=1&destination='));assert.ok(navigation.href.includes('travelmode=driving'));const staff=detail.children.find(x=>x.className==='day-route-staffing');assert.equal(staff.children[1].children[0].textContent,'測試志工');assert.equal(staff.children[1].children[0].children[0].textContent,'👑');assert.match(staff.children[1].className,/is-route-leader/);assert.match(staff.children[1].children[1].innerHTML,/tel:0912345678/);assert.ok(!detail.children.some(n=>String(n.textContent).includes('門牌精準度')));
 events.get('achang:route-time-filter')({detail:{shift:'日間',start:'06:15',end:'07:50'}});
 assert.equal(node('mapRouteLayerSelect').value,'all');assert.ok(sources.get('achang-day-routes-points').data.features.every(f=>f.properties.route.startsWith('日間')));
});
