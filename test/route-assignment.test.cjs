'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDraft,eligible}=require('../route-assignment'),{catalog,saveBatch}=require('../lib/route-assignment-batch'),L=require('../lib/server');
const person={id:'1bc211b4-bc21-4cd7-a7c2-a960958a96d4',name:'甲志工'},second={id:'2bc211b4-bc21-4cd7-a7c2-a960958a96d4',name:'乙志工'},rows=catalog(),a={...rows.get('PDF:DAY:0051')},b={...rows.get('PDF:DAY:0052')},other={...rows.get('PDF:DAY:0001')};
test('multi-vehicle draft preserves selections, permits adjacent stops, and removes only the selected person/stop',()=>{
 const d=createDraft();d.stage(person,a,'2026-11-03','復華里');d.stage(person,b,'2026-11-03','復華里');d.stage(second,other,'2026-11-03','勝利里');
 assert.equal(d.items().length,3);d.stage(person,a,'2026-11-03','復華里');assert.equal(d.items().length,3);
 assert.throws(()=>d.stage(person,other,'2026-11-03','復華里'),/其他車次/);
 const item=d.items()[0];d.remove([item.volunteerId,item.date,item.stopId].join('|'));assert.equal(d.items().length,2);assert.equal(d.items()[0].stopId,b.站點ID);
 const snapshot=d.items();snapshot[0].name='changed';assert.equal(d.items()[0].name,person.name);
});
test('draft reuses a confirmation ID after failure and rotates it after editing',()=>{
 const d=createDraft();d.stage(person,a,'2026-11-03','復華里');const first=d.payload(()=> 'first');assert.equal(d.payload(()=> 'other').batchId,'first');assert.deepEqual(Object.keys(first.items[0]),['volunteerId','stopId','date']);
 d.stage(second,a,'2026-11-03','勝利里');assert.equal(d.payload(()=> 'second').batchId,'second');d.clear();assert.equal(d.items().length,0);
});
test('draft rejects excluded members, invalid dates, struck stops, and persisted route conflicts',()=>{
 assert.equal(eligible({...person,name:'@測試員'}),false);assert.equal(eligible({...person,name:'＠測試員'}),false);assert.equal(eligible({...person,name:'PMOS管理員'}),false);
 const d=createDraft();assert.throws(()=>d.stage(person,a,'2026-02-30','復華里'),/日期/);assert.throws(()=>d.stage(person,{...a,來源刪除線:true},'2026-11-03','復華里'),/停用/);assert.throws(()=>d.stage(person,a,'2026-11-03',''),/里別/);
 assert.throws(()=>d.stage(person,a,'2026-11-03','復華里',[{volunteer_id:person.id,visit_date:'2026-11-03',shift:'日間',route_id:'other',area:'復華里'}]),/其他車次/);
 d.stage(person,a,'2026-11-03','復華里',[{volunteer_id:person.id,visit_date:'2026-11-03',shift:'夜間',route_id:'other'}]);assert.equal(d.items().length,1);
});
test('batch canonicalization keeps an inserted day6 stop and source order aligned with the app',()=>{
 const overlay={id:'d6000000-0000-4000-8000-000000000001',shift:'日間',route_token:'日間6',vehicle:'AAQ-059',area:'大橋里',stop_name:'大橋一街228號',start_time:'06:52',end_time:'06:54',display_order:2,status:'active',created_at:'2026-11-03'};
 const rows=catalog([overlay]);assert.equal(rows.get('OVERLAY:'+overlay.id)._taskOrder,2);assert.equal(rows.get('PDF:DAY:0159')._taskOrder,3);assert.equal(rows.get('PDF:NIGHT:1564')._taskOrder,7);
});
test('batch API ignores supplied address/time and submits one atomic RPC with server-side source data',async()=>{
 const calls=[],fake={...L,rest:async(path,token,options)=>{calls.push({path,token,options});return {ok:true,data:path.startsWith('rpc/')?{createdCount:1}:[]};}};
 const id='3bc211b4-bc21-4cd7-a7c2-a960958a96d4';const result=await saveBatch({batchId:id,items:[{volunteerId:person.id,stopId:'PDF:DAY:0051',date:'2026-11-03',area:'復華里',address:'untrusted',time:'23:59',routeId:'fake'}]},{token:'admin-token'},fake);
 assert.equal(result.createdCount,1);assert.equal(calls.filter(c=>c.options?.method==='POST').length,1);const rpc=calls.at(-1);assert.equal(rpc.path,'rpc/achang_assign_route_batch');assert.equal(rpc.token,'admin-token');assert.equal(rpc.options.body.p_items[0].time,a.到達);assert.equal(rpc.options.body.p_items[0].address,a.停靠點原文);assert.equal(rpc.options.body.p_items[0].route_id,a.路線ID);
 await assert.rejects(()=>saveBatch({batchId:id,items:[{volunteerId:person.id,stopId:'PDF:NIGHT:1563',date:'2026-11-03',area:'復華里'}]},{token:'admin-token'},fake),/站點/);
});
test('batch handler returns conflict errors and forbids volunteer requests before database access',async()=>{
 await assert.rejects(()=>saveBatch({batchId:'3bc211b4-bc21-4cd7-a7c2-a960958a96d4',items:[{volunteerId:person.id,stopId:'PDF:DAY:0051',date:'2026-11-03',area:'復華里'}]},{token:'t'},{...L,rest:async path=>path.startsWith('rpc/')?{ok:false,data:{code:'23505',message:'衝突'}}:{ok:true,data:[]}}),e=>e.status===409&&e.message==='衝突');
 const source=fs.readFileSync(require.resolve('../api/tasks'),'utf8'),module={exports:{}},fake={...L,run:fn=>fn,authorized:async()=>({role:'volunteer'}),body:req=>req.body,rest:()=>{throw Error('unexpected database access');}};
 vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{})(id=>id==='../lib/server'?fake:require(id),module,module.exports);
 await assert.rejects(()=>module.exports({method:'POST',body:{action:'batch'}},{}),e=>e.status===403);
});
test('UI exposes day/night buttons, default labels and only the settings panel owns the layer switches',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),dir=fs.readFileSync(require.resolve('../route-directory.js'),'utf8'),css=fs.readFileSync(require.resolve('../map-settings.css'),'utf8');
 assert.doesNotMatch(html,/<select id="shift"/);assert.match(html,/data-directory-shift="日間"/);assert.match(html,/class="night-shift" data-directory-shift="夜間"/);
 const menu=html.slice(html.indexOf('id="mapLayerSettings"'),html.indexOf('</aside>',html.indexOf('id="mapLayerSettings"')));for(const id of ['layerRoutes','layerVolunteer','layerDay','layerNight'])assert.ok(menu.includes('id="'+id+'"'));
 assert.match(html,/id="directoryRouteSummary"/);assert.match(css,/\.map-route-layer-legend\{display:none!important\}/);
 const ctx=vm.createContext({$:()=>({value:'日間'})});vm.runInContext(dir.slice(dir.indexOf('function defaultDirectoryTimeWindow('),dir.indexOf('function matchesDirectoryTime(')),ctx);assert.equal(ctx.directoryTimeOptionLabel('06:15','directoryStartTime',['06:15','10:00']),'06:15（預設）');
});

test('area and route allocation reuse the same escaped member card and phone rendering',()=>{
 const cards=require('../member-cards'),p={id:'safe-id',name:'<測試人員>',phone:'+886912345678',assignment:'復華里'};
 const html=cards.renderCard(p,{allocations:['日間2 第1站'],actions:'<button data-stage-person="safe-id">加入本站</button>'});
 assert.ok(html.includes('class="member '));assert.ok(html.includes('class="member-info"'));assert.ok(html.includes('class="member-actions"'));assert.ok(html.includes('class="phone-link service-phone"'));assert.ok(html.includes('0912-345-678'));assert.ok(html.includes('&lt;測試人員&gt;'));assert.ok(html.includes('日間2 第1站'));
 const app=fs.readFileSync(require.resolve('../app.js'),'utf8'),route=fs.readFileSync(require.resolve('../route-assignment.js'),'utf8');assert.ok(app.includes('window.AChangMemberCards.renderCard'));assert.ok(route.includes('window.AChangMemberCards.renderCard'));
});

test('whole-route draft stages every selected station atomically with one area for a pending person',()=>{
 const d=createDraft(),stops=[{...a,里別:'勝利里'},{...b,里別:'復華里'}];d.stageRoute(person,stops,'2026-11-03');assert.equal(d.items().length,2);assert.deepEqual(d.items().map(x=>x.area),['勝利里','勝利里']);
 const before=d.items();assert.throws(()=>d.stageRoute(second,[...stops,{...b,到達:'invalid'}],'2026-11-03'),/時間/);assert.deepEqual(d.items(),before);
});

test('whole-route API retains the existing route area for an unallocated member',async()=>{
 let saved;const fake={...L,rest:async(path,token,options)=>{if(path.startsWith('rpc/')){saved=options.body.p_items;return {ok:true,data:{ok:true}};}if(path.startsWith('assignments?'))return {ok:true,data:[{member_id:person.id,service_date:'2026-11-03',shift:'day',route_id:a.路線ID,village:'復國里'}]};return {ok:true,data:[]};}};
 await saveBatch({batchId:'3bc211b4-bc21-4cd7-a7c2-a960958a96d4',items:[a,b].map(row=>({volunteerId:person.id,date:'2026-11-03',stopId:row.站點ID}))},{token:'admin'},fake);assert.equal(saved.length,2);assert.ok(saved.every(item=>item.village==='復國里'));
});

test('vehicle leader selection is staged, exclusive per route, and saved with the same batch',async()=>{
 const d=createDraft();d.stageRoute(person,[a,b],'2026-11-03');d.stageRoute(second,[a,b],'2026-11-03');d.chooseLeader(person,a,'2026-11-03');
 assert.equal(d.items().filter(x=>x.isRouteLeader).length,1);assert.equal(d.payload(()=> 'first').items.find(x=>x.isRouteLeader).volunteerId,person.id);
 d.chooseLeader(second,b,'2026-11-03');assert.equal(d.payload(()=> 'second').batchId,'second');assert.equal(d.items().find(x=>x.isRouteLeader).volunteerId,second.id);
 let canonical;const fake={...L,rest:async(path,token,options)=>{if(path.startsWith('rpc/'))canonical=options.body.p_items;return {ok:true,data:path.startsWith('rpc/')?{ok:true}:[]};}};
 await saveBatch({...d.payload(()=> 'ignored'),batchId:'3bc211b4-bc21-4cd7-a7c2-a960958a96d4'},{token:'admin'},fake);assert.equal(canonical.filter(x=>x.is_route_leader).length,1);assert.equal(canonical.find(x=>x.is_route_leader).member_id,second.id);
 d.clear();assert.deepEqual(d.items(),[]);
});

test('saved allocation removals stay in the draft, can be undone, and join the same atomic payload',()=>{
 const d=createDraft(),task={id:'4bc211b4-bc21-4cd7-a7c2-a960958a96d4',visit_date:'2026-11-03',route_id:a.路線ID,stop_order:1};
 d.removeSaved(task,person.name);d.removeSaved(task,person.name);assert.equal(d.size(),1);assert.deepEqual(d.payload(()=> 'first').items,[{action:'remove',taskId:task.id}]);
 d.stage(second,b,'2026-11-03','復華里');assert.equal(d.size(),2);assert.equal(d.payload(()=> 'second').items.length,2);
 d.cancelRemoval(task.id);assert.equal(d.removals().length,0);assert.equal(d.size(),1);d.clear();assert.equal(d.size(),0);
});
test('removal API derives the member and vehicle from the saved allocation rather than client fields',async()=>{
 let canonical;const taskId='4bc211b4-bc21-4cd7-a7c2-a960958a96d4',assignmentId='5bc211b4-bc21-4cd7-a7c2-a960958a96d4';
 const fake={...L,rest:async(path,token,options)=>{
  if(path.startsWith('rpc/')){canonical=options.body.p_items;return {ok:true,data:{removedCount:1}};}
  if(path.startsWith('assignments?'))return {ok:true,data:[{id:assignmentId,member_id:person.id,service_date:'2026-11-03',shift:'day',route_id:a.路線ID,village:'復華里'}]};
  if(path.startsWith('visit_tasks?'))return {ok:true,data:[{id:taskId,assignment_id:assignmentId,member_id:person.id}]};return {ok:true,data:[]};
 }};
 await saveBatch({batchId:'3bc211b4-bc21-4cd7-a7c2-a960958a96d4',items:[{action:'remove',taskId,volunteerId:second.id,route_id:'fake'}]},{token:'admin'},fake);
 assert.equal(canonical[0].member_id,person.id);assert.equal(canonical[0].route_id,a.路線ID);assert.equal(canonical[0].action,'remove');
});

test('opening the application starts on the map and task dispatch is the second tab in both navigation bars',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),app=fs.readFileSync(require.resolve('../app.js'),'utf8');
 for(const type of ['desktop-nav','bottom-nav']){const nav=html.match(new RegExp('<nav class="'+type+'"[^>]*>(.*?)</nav>','s'))[1];assert.deepEqual([...nav.matchAll(/data-page="([^"]+)"/g)].map(x=>x[1]),['map','reports','areas','planner','people']);}
 assert.match(html,/id="page-map" class="page active/);assert.match(app,/routes=\[\],page='map'/);assert.doesNotMatch(app,/await refreshOnline\(\);go\('areas'\)/);
});

test('selecting stations waits for the personnel button and clearing removes every highlight',()=>{
 const listeners=new Map(),nodes=new Map();
 class Node{
  constructor(){this.dataset={};this.hidden=false;this.children=[];this.states=new Set();this.classList={contains:k=>this.states.has(k),add:k=>this.states.add(k),toggle:(k,force)=>{const on=force===undefined?!this.states.has(k):!!force;if(on)this.states.add(k);else this.states.delete(k);return on;}};}
  append(x){x.parentElement=this;this.children.push(x);}setAttribute(){}addEventListener(){}querySelector(){return null;}getBoundingClientRect(){return {left:800,top:100};}
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};node('page-map').states.add('active');
 const cards=[new Node(),new Node()],buttons=[a,b].map((r,i)=>{const n=new Node();n.dataset.focusStop=r.站點ID;n.closest=()=>cards[i];return n;});
 const document={getElementById:node,createElement:()=>new Node(),body:new Node(),documentElement:{clientWidth:1400,clientHeight:1000},querySelectorAll:()=>buttons,addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
 const window={AChangRouteDirectory:{activeRoute:()=>a.車次},addEventListener(){}};
 const ctx=vm.createContext({document,window,Intl,Date,console});vm.runInContext(fs.readFileSync(require.resolve('../route-assignment'),'utf8'),ctx);
 ctx.AChangRouteAssignment.create({getContext:()=>({role:'admin',subject:'admin-test',people:[],tasks:[],date:'2026-11-03'}),getRows:()=>[a,b],submit:()=>{throw Error('must not save during selection');}});
 const emit=(type,detail)=>listeners.get(type).forEach(fn=>fn({detail}));
 assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,0);
 emit('achang:focus-route-stop',{id:a.站點ID,route:a.車次});emit('achang:focus-route-stop',{id:b.站點ID,route:b.車次});
 assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,2);assert.equal(node('detail').children.length,0,'the personnel picker must wait until explicitly requested');
 emit('achang:clear-route-selection');assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,0);assert.equal(node('routePickPeople').disabled,true);
});
