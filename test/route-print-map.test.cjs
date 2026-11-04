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

test('the printable map fills the A4 content width at 2400 pixels with vector marks and releases its renderer',async()=>{
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
  getCanvas(){return {width:2400,height:Number(captured.container.style.height.replace('px',''))*2,toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,synthetic';}};}
  getBounds(){return {getSouthWest:()=>({lng:120.20,lat:22.99}),getNorthEast:()=>({lng:120.30,lat:23.07})};}
  remove(){removed=true;}
 }
 const model=layer.filterModelWindow(layer.build(rows,catalog,'日間3'),'06:30','07:33');
 const svg=await printer.buildSvg(model,{map:{getStyle:()=>({version:8,sources:{roads:{type:'vector'}},layers:[{id:'roads',source:'roads'}]})},lib:{Map},document:doc});
 assert.equal(captured.pixelRatio,2);assert.equal(captured.canvasContextAttributes.preserveDrawingBuffer,true);
 assert.equal(svg.attributes['data-station-count'],'3');
 assert.equal(svg.children.filter(node=>node.attributes['data-route-stop']).length,3);
 assert.equal(svg.children.filter(node=>node.attributes['data-route-from']).length,2);
 const image=svg.children.find(node=>node.tag==='image');assert.equal(image.attributes['data-pixel-width'],'2400');assert.equal(captured.container.style.height,'529px');assert.equal(image.attributes['data-pixel-height'],'1058');assert.equal(svg.attributes.viewBox,'0 0 1200 529');
 for(const label of svg.children.filter(node=>node.attributes['data-stop-number'])){assert.ok(Number(label.attributes.x)>=12);assert.ok(Number(label.attributes.x)+String(label.textContent).length*30<=1188);assert.ok(Number(label.attributes.y)>=56&&Number(label.attributes.y)<=499);}
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

test('common vehicle crew is printed once only when every selected station has the exact same people',()=>{
 const a={id:'one',name:'甲志工',leader:true},b={id:'two',name:'乙志工',leader:false};
 assert.deepEqual(printer.commonCrew([[a,b],[b,a]]),[a,b]);assert.deepEqual(printer.commonCrew([[a,b],[a]]),[]);assert.deepEqual(printer.commonCrew([[a],[]]),[]);assert.deepEqual(printer.commonCrew([]),[]);
});

test('print diagram connectors follow every next station, including a reversed row',()=>{
 const source=fs.readFileSync(require.resolve('../route-directory'),'utf8'),start=source.indexOf('function connectDiagram('),end=source.indexOf('function stationCards(',start);
 const vm=require('node:vm'),points=[{left:10,top:10,width:40,height:40},{left:230,top:10,width:40,height:40},{left:230,top:230,width:40,height:40},{left:10,top:230,width:40,height:40}];let html='';
 const context=vm.createContext({Math});vm.runInContext(source.slice(start,end),context);
 context.connectDiagram({querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0}),querySelectorAll:()=>points.map(bounds=>({getBoundingClientRect:()=>bounds})),insertAdjacentHTML:(_,value)=>html=value});
 assert.equal((html.match(/class="route-direction"/g)||[]).length,2);assert.match(html,/rotate\(0deg\)/);assert.match(html,/data-connection="row-transition" data-from="2" data-to="3"/);assert.match(html,/rotate\(180deg\)/);
});

test('day-route paper scaling keeps the complete content within one A4 content height',()=>{
 const width=190*96/25.4;
 assert.equal(printer.paperScale(600,width),1);
 for(const height of [1100,1800,4000]){const scale=printer.paperScale(height,width);assert.ok(scale>0&&scale<=1);assert.ok(height*scale<277*96/25.4);}
});

function diagramFor(cards){
 const source=fs.readFileSync(require.resolve('../route-directory'),'utf8'),start=source.indexOf('function connectDiagram('),end=source.indexOf('function stationCards(',start),vm=require('node:vm');let html='';
 const context=vm.createContext({Math});vm.runInContext(source.slice(start,end),context);context.connectDiagram({querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0}),querySelectorAll:()=>cards.map(card=>({getBoundingClientRect:()=>({left:card.left+card.width/2-20,top:card.top+44,width:40,height:40}),closest:()=>({getBoundingClientRect:()=>card})})),insertAdjacentHTML:(_,value)=>html=value});return html;
}
test('a partial live row connects from the previous card through the gutter without crossing either card',()=>{
 const cards=[{left:10,top:36,width:138,height:265},{left:165,top:36,width:138,height:265},{left:321,top:36,width:138,height:265},{left:165,top:337,width:138,height:274}],html=diagramFor(cards);
 const transition=html.match(/<svg[^>]*data-connection="row-transition"[^>]*>.*?<\/svg>/)[0];
 assert.match(transition,/data-from="3" data-to="4"/);assert.match(transition,/d="M 390 303 V 319 H 234 V 327"/);
 assert.match(transition,/points="234,335 228,326 240,326"/,'the final arrow points down at the next card border, above its time');
 assert.equal((html.match(/data-connection="between-cards"/g)||[]).length,2);
});
test('six-column print returns left after stations 32 and 38, then down toward 33 and 39',()=>{
 const cards=Array.from({length:14},(_,i)=>({left:(i%6)*120,top:Math.floor(i/6)*232,width:112,height:200})),html=diagramFor(cards);
 const transitions=[...html.matchAll(/<svg[^>]*data-connection="row-transition"[^>]*>.*?<\/svg>/g)].map(match=>match[0]);
 assert.equal(transitions.length,2);
 assert.match(transitions[0],/data-from="6" data-to="7"/);assert.match(transitions[0],/d="M 656 202 V 216 H 56 V 222"/);
 assert.match(transitions[1],/data-from="12" data-to="13"/);assert.match(transitions[1],/d="M 656 434 V 448 H 56 V 454"/);
 assert.match(transitions[0],/points="349,216 361,211 361,221"/,'the return arrow points left inside the row gutter');
 assert.equal((html.match(/data-connection="between-cards"/g)||[]).length,11);
});


test('print action opens an isolated document, waits for styling and images, then invokes its native print function',async()=>{
 const events=[],copied={style:{},dataset:{printPages:'1'}},sheet={privateFixture:true};
 const node=tag=>({tag,children:[],style:{},dataset:{},append(...children){this.children.push(...children);for(const child of children)if(child.rel==='stylesheet')queueMicrotask(()=>{events.push('style-loaded');child.onload();});}});
 const doc={title:'',head:node('head'),body:node('body'),createElement:node,importNode:(value,deep)=>{assert.equal(value,sheet);assert.equal(deep,true);return copied;},querySelectorAll:selector=>{assert.equal(selector,'img');return [{decode:async()=>events.push('image-decoded')}];},fonts:{ready:Promise.resolve()}};
 doc.body.replaceChildren=(...children)=>{doc.body.children=children;events.push('document-ready');};
 const target={document:doc,opener:{},requestAnimationFrame:fn=>queueMicrotask(fn),focus:()=>events.push('focus'),print:()=>events.push('print'),close(){}};
 const source={baseURI:'https://achang.pmos.space/',querySelectorAll:selector=>{assert.equal(selector,'link[rel="stylesheet"]');return [{href:'https://achang.pmos.space/styles.css'},{href:'https://achang.pmos.space/day-route-layer.css'}];}};
 const result=await printer.printDocument(sheet,{document:source,window:{open:(url,name,features)=>{assert.equal(url,'');assert.equal(name,'_blank');assert.match(features,/popup/);return target;}}});
 assert.equal(result,target);assert.equal(doc.title,'路線列印');assert.equal(doc.body.children[1],copied);assert.equal(copied.className,'route-print-compact truck-directory-host');assert.equal(copied.dataset.printPages,undefined);assert.equal(target.opener,null);assert.equal(events.at(-1),'print');assert.equal(events.filter(x=>x==='print').length,1);assert.ok(events.indexOf('style-loaded')<events.indexOf('print'));assert.ok(events.indexOf('image-decoded')<events.indexOf('print'));assert.deepEqual(sheet,{privateFixture:true});
 doc.body.children[0].children[0].onclick();assert.equal(events.filter(x=>x==='print').length,2,'the separate print page also provides a working manual print button');
});

test('a blocked print popup produces an actionable error instead of silently doing nothing',async()=>{
 await assert.rejects(()=>printer.printDocument({}, {window:{open:()=>null},document:{}}),/允許.*彈出視窗/);
});

test('borderless daytime fit uses the full 210 by 297 mm A4 page and keeps long content on one page',()=>{
 const width=210*96/25.4,pageHeight=297*96/25.4;
 assert.equal(printer.borderlessA4Scale(700,width),1);
 for(const height of [pageHeight,1800,4000]){const scale=printer.borderlessA4Scale(height,width);assert.ok(scale>0&&scale<=1);assert.ok(height*scale<pageHeight);}
 assert.equal(printer.borderlessA4Scale(0,width),1);
});


test('A4 full printing reserves a centered 95 percent rectangle and scales a day route into it',()=>{
 const box=printer.a4Metrics();assert.equal(box.width,210);assert.equal(box.height,297);assert.equal(box.contentWidth,199.5);assert.ok(Math.abs(box.contentHeight-282.15)<1e-8);assert.ok(Math.abs(box.marginX-5.25)<1e-8);assert.ok(Math.abs(box.marginY-7.425)<1e-8);
 const width=box.contentWidth*96/25.4;
 for(const height of [400,1200,3000]){const scale=printer.a4FitScale(height,width);assert.ok(scale>0&&scale<=1);assert.ok(height*scale<=box.contentHeight*96/25.4-1);}
});
test('night layout minimizes pages before preferring wider station cards',()=>{
 const layouts=[{columns:3,pages:[1,2,3]},{columns:4,pages:[1,2]},{columns:5,pages:[1,2]},{columns:6,pages:[1,2,3]}];
 assert.equal(printer.chooseA4Layout(layouts),layouts[1]);assert.deepEqual(layouts.map(x=>x.columns),[3,4,5,6]);
 assert.equal(printer.chooseA4Layout([{columns:3,pages:[1,2]},{columns:6,pages:[1]}]).columns,6);
});


test('the native print window preserves prepacked A4 pages and the day fit or night layout class',async()=>{
 for(const kind of ['day','night']){
  const copied={style:{},dataset:{printPages:kind==='day'?'1':'3'}},sheet={dataset:{printMode:'full'},classList:{contains:name=>name==='route-print-a4'||name===(kind==='night'?'route-print-night':'route-print-day-a4')}};
  const node=tag=>({tag,children:[],append(...children){this.children.push(...children);}}),doc={head:node('head'),body:node('body'),createElement:node,importNode:()=>copied,querySelectorAll:()=>[],fonts:{ready:Promise.resolve()}};
  doc.body.replaceChildren=(...children)=>{doc.body.children=children;};let prints=0;
  const target={document:doc,requestAnimationFrame:fn=>queueMicrotask(fn),focus(){},print(){prints++;},close(){}};
  await printer.printDocument(sheet,{window:{open:()=>target},document:{baseURI:'https://achang.pmos.space/',querySelectorAll:()=>[]}});
  assert.match(copied.className,/route-print-a4/);assert.match(copied.className,kind==='night'?/route-print-night/:/route-print-day-a4/);assert.equal(copied.dataset.printPages,kind==='day'?'1':'3');assert.equal(prints,1);
  const pageRules=doc.head.children.filter(x=>x.tag==='style').map(x=>x.textContent).join('');assert.match(pageRules,/@page achang-route-a4\{size:A4 portrait;margin:0\}/);assert.match(pageRules,/--day-fit-transform/);
 }
});
