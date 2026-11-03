'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const printer=require('../route-print-map'),layer=require('../day-route-layer'),official=require('../official-routes');
const rows=official.normalize(require('../data-official-day-20261030.source.json'),'日間'),catalog=require('../data-day-route-locations-20261103.json');

test('printing the reported 06:30–07:33 day3 window contains only those three stops and their two segments',()=>{
 const full=layer.build(rows,catalog,'日間3');
 const selected=layer.filterModelWindow(full,'06:30','07:33');
 const snapshot=printer.filterByIds(selected,selected.stops.map(stop=>stop.id));
 assert.equal(full.total,94);assert.equal(snapshot.total,3);assert.equal(snapshot.points.features.length,3);assert.equal(snapshot.lines.features.length,2);
 assert.deepEqual(snapshot.stops.map(stop=>stop.order),[2,3,4]);
 assert.ok(snapshot.lines.features.every(feature=>feature.properties.from>=2&&feature.properties.to<=4));
 assert.equal(full.total,94,'the live route model must remain unchanged');
});
test('a discontinuous selected set never draws a shortcut across omitted stops',()=>{
 const full=layer.build(rows,catalog,'日間3');
 const selected=printer.filterByIds(full,[full.stops[1].id,full.stops[3].id]);
 assert.equal(selected.points.features.length,2);assert.equal(selected.lines.features.length,0);
 assert.equal(printer.filterByIds(full,[]).total,0);
});
test('the print basemap strips route and village overlays without modifying the live style',()=>{
 const style={version:8,sources:{roads:{type:'vector'},villages:{type:'geojson'},'achang-day-routes':{type:'geojson'},'achang-day-routes-points':{type:'geojson'}},layers:[{id:'roads',source:'roads'},{id:'villages',source:'villages'},{id:'all-route-lines',source:'achang-day-routes'},{id:'all-route-points',source:'achang-day-routes-points'}]};
 const copy=printer.baseStyle(style);
 assert.deepEqual(copy.layers.map(layer=>layer.id),['roads']);assert.deepEqual(Object.keys(copy.sources),['roads']);
 assert.equal(style.layers.length,4);
});

test('the printable map uses a 2400×1600 canvas and vector marks, then removes its temporary renderer',async()=>{
 class Node{
  constructor(tag){this.tag=tag;this.attributes={};this.children=[];this.style={};}
  setAttribute(key,value){this.attributes[key]=String(value);}
  append(...nodes){this.children.push(...nodes);}
  remove(){this.removed=true;}
 }
 const doc={body:new Node('body'),createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
 let captured,removed=false;
 class Map{
  constructor(options){captured=options;}
  once(_,handler){queueMicrotask(handler);}
  on(){}
  getCanvas(){return {width:2400,height:1600,toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,synthetic';}};}
  getBounds(){return {getSouthWest:()=>({lng:120.20,lat:22.99}),getNorthEast:()=>({lng:120.30,lat:23.07})};}
  remove(){removed=true;}
 }
 const model=layer.filterModelWindow(layer.build(rows,catalog,'日間3'),'06:30','07:33');
 const svg=await printer.buildSvg(model,{map:{getStyle:()=>({version:8,sources:{roads:{type:'vector'}},layers:[{id:'roads',source:'roads'}]})},lib:{Map},document:doc});
 assert.equal(captured.pixelRatio,2);assert.equal(captured.canvasContextAttributes.preserveDrawingBuffer,true);
 assert.equal(svg.attributes['data-station-count'],'3');
 assert.equal(svg.children.filter(node=>node.attributes['data-route-stop']).length,3);
 assert.equal(svg.children.filter(node=>node.attributes['data-route-from']).length,2);
 const image=svg.children.find(node=>node.tag==='image');assert.equal(image.attributes['data-pixel-width'],'2400');assert.equal(image.attributes['data-pixel-height'],'1600');
 assert.ok(removed);assert.ok(doc.body.children[0].removed);
});
test('requested route labels and every daytime option carry the requested text and icon',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),js=fs.readFileSync(require.resolve('../day-route-layer.js'),'utf8'),directory=fs.readFileSync(require.resolve('../route-directory.js'),'utf8');
 assert.match(html,/checked \/> 車次路線/);
 const options=html.match(/<select id="mapRouteLayerSelect"[^>]*>(.*?)<\/select>/s)[1].match(/<option[^>]*>[^<]+<\/option>/g);
 const dayOptions=options.filter(option=>/value="(?:all|日間[1-6])"/.test(option));assert.equal(dayOptions.length,7);assert.ok(dayOptions.every(option=>option.includes('>☀️ ')));
 const nightOptions=options.filter(option=>/value="(?:night-all|夜間\d+)"/.test(option));assert.equal(nightOptions.length,25);assert.ok(nightOptions.every(option=>option.includes('>🌙 ')));
 assert.match(js,/．共\$\{count\}站點/);
 assert.match(directory,/await window\.AChangRouteMapPrint\?\.\(snapshot\.route,\{start,end,stopIds:snapshot\.rows\.map/);
});
