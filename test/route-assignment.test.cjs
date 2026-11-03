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

function assignmentHarness({people=[],tasks=[],visible=[a.站點ID,b.站點ID]}={}){
 const listeners=new Map(),nodes=new Map();
 class Node{
  constructor(){this.dataset={};this.style={};this.attributes={};this.handlers={};this.hidden=false;this.children=[];this.states=new Set();this.classList={contains:k=>this.states.has(k),add:k=>this.states.add(k),toggle:(k,force)=>{const on=force===undefined?!this.states.has(k):!!force;if(on)this.states.add(k);else this.states.delete(k);return on;}};}
  append(x){x.parentElement=this;this.children.push(x);}setAttribute(k,v){this.attributes[k]=v;}addEventListener(type,fn){this.handlers[type]=fn;}querySelector(){return null;}getBoundingClientRect(){return {left:800,top:100};}
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};node('page-map').states.add('active');
 const cards=[new Node(),new Node()],buttons=[a,b].map((r,i)=>{const n=new Node();n.dataset.focusStop=r.站點ID;n.closest=()=>cards[i];return n;});
 const document={getElementById:node,createElement:()=>new Node(),body:new Node(),documentElement:{clientWidth:1400,clientHeight:1000},querySelectorAll:()=>buttons,addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
 const window={AChangRouteDirectory:{activeRoute:()=>a.車次,activeStopIds:()=>visible},AChangMemberCards:require('../member-cards'),addEventListener(){}};
 document.dispatchEvent=()=>{};const ctx=vm.createContext({document,window,Intl,Date,console,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}}});vm.runInContext(fs.readFileSync(require.resolve('../route-assignment'),'utf8'),ctx);
 const controller=ctx.AChangRouteAssignment.create({getContext:()=>({role:'admin',subject:'admin-test',people,tasks,date:'2026-11-03'}),getRows:()=>[a,b],submit:()=>{throw Error('must not save during selection');}});
 return {controller,cards,node,setWindow:ids=>{visible=ids;},emit:(type,detail)=>listeners.get(type).forEach(fn=>fn({detail})),panel:()=>node('detail').children[0]};
}
test('one card click opens the attached personnel picker; title all-select toggles off and restores its hint',()=>{
 const {cards,node,emit,panel}=assignmentHarness();
 assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,0);assert.equal(node('routeTitle').children.at(-1).textContent,'（點擊全選站點）');
 emit('achang:focus-route-stop',{id:a.站點ID,route:a.車次});assert.equal(panel().hidden,false,'a single card click opens personnel immediately');
 emit('achang:focus-route-stop',{id:b.站點ID,route:b.車次});assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,2);assert.equal(node('routeTitle').children.at(-1).textContent,'（站點已全選）');
 emit('achang:focus-route-stop',{id:a.站點ID,route:a.車次,all:true,stopIds:[a.站點ID,b.站點ID]});assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,0);assert.equal(panel().hidden,true);assert.equal(node('routeTitle').children.at(-1).textContent,'（點擊全選站點）');
 emit('achang:focus-route-stop',{id:a.站點ID,route:a.車次,all:true,stopIds:[a.站點ID,b.站點ID]});assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,2);assert.equal(panel().hidden,false);emit('achang:clear-route-selection');assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,0);
});
test('a staged-only person has draft removal while saved vehicle members alone have remove-allocation controls',()=>{
 const {controller,emit,panel}=assignmentHarness({people:[person,second],tasks:[{id:'saved',volunteer_id:second.id,visit_date:'2026-11-03',shift:a.時段,route_id:a.路線ID,stop_order:1,stop_address:a.停靠點原文}]});
 controller.draft.stage(person,a,'2026-11-03','復華里');emit('achang:focus-route-stop',{id:a.站點ID,route:a.車次});
 assert.doesNotMatch(panel().innerHTML,new RegExp('data-remove-person="'+person.id+'"'));assert.match(panel().innerHTML,/移出暫排/);assert.match(panel().innerHTML,new RegExp('data-remove-person="'+second.id+'"'));
});
test('obsolete station toolbar is removed and route cards retain only service icons',()=>{
 for(const name of ['index.html','route-directory.html']){const html=fs.readFileSync(require.resolve('../'+name),'utf8');assert.doesNotMatch(html,/routeSelectionToolbar|routePickPeople|routeSelectAll|routeClearSelection/);assert.match(html,/route-progress-clock-row.*?routeProgressClock.*?routeClearAssignments/s);}
 const directory=fs.readFileSync(require.resolve('../route-directory'),'utf8');assert.doesNotMatch(directory,/已準備 \$\{snapshot|🗑️ 清運：|♻️ 回收：/);assert.match(directory,/點擊全選站點/);
});

test('map popup staffing keeps private contacts behind the current session and volunteer task scope',()=>{
 const app=fs.readFileSync(require.resolve('../app.js'),'utf8'),start=app.indexOf('function routeStopStaffing('),end=app.indexOf('function mapScheduleDate(',start),privateData={date:'2026-11-03',people:[{id:'private',name:'私密名冊',phone:'0912345678'}]};
 const context=vm.createContext({liveRole:'',routeAssignmentController:{staffing:()=>privateData},mapScheduleDate:()=> '2026-11-03',data:{stops:[{站點ID:'one'}]},mapTasksForStop:()=>[{volunteer_id:'own',is_route_leader:true}],groupContacts:[{id:'own',name:'本人',phone:'0911111111'},{id:'other',name:'其他車次',phone:'0922222222'}]});
 vm.runInContext(app.slice(start,end),context);assert.equal(context.routeStopStaffing('one').people.length,0);context.liveRole='admin';assert.equal(context.routeStopStaffing('one'),privateData);context.liveRole='volunteer';assert.deepEqual(Array.from(context.routeStopStaffing('one').people,p=>p.id),['own']);context.liveRole='';assert.equal(context.routeStopStaffing('one').people.length,0);
});

test('a station chip removal affects only that member at that station and keeps other drafts and saved tasks intact',()=>{
 const date='2026-11-03',d=createDraft();d.stageRoute(person,[a,b],date);d.stage(second,a,date,'復華里');
 const task=(id,p,row,day=date)=>({id,volunteer_id:p.id,visit_date:day,shift:row.時段,route_id:row.路線ID,stop_address:row.停靠點原文,stop_order:row._taskOrder});
 const tasks=[task('target',person,a),task('other-stop',person,b),task('other-person',second,a),task('other-day',person,a,'2026-11-04')];
 d.removePersonAt(person,a,date,tasks);
 assert.deepEqual(d.removals().map(x=>x.taskId),['target']);assert.deepEqual(d.items().map(x=>[x.volunteerId,x.stopId]),[[person.id,b.站點ID],[second.id,a.站點ID]]);assert.equal(tasks.length,4,'saved tasks remain unchanged until final confirmation');
});

test('clearing a vehicle stages only that date and route, preserves other work, and never alters saved tasks directly',()=>{
 const d=createDraft(),date='2026-11-03';d.stage(person,a,date,'復華里');d.stage(second,other,date,'勝利里');d.stage(person,a,'2026-11-04','復華里');
 const tasks=[{id:'one',volunteer_id:person.id,visit_date:date,route_id:a.路線ID},{id:'two',volunteer_id:second.id,visit_date:date,truck:a.路線ID},{id:'another-date',visit_date:'2026-11-04',route_id:a.路線ID},{id:'another-route',visit_date:date,route_id:other.路線ID}];
 assert.deepEqual(d.clearRoute(a.路線ID,date,tasks,[person,second]),{draftsRemoved:1,removalsAdded:2});assert.equal(d.items().length,2);assert.deepEqual(d.removals().map(x=>x.taskId),['one','two']);assert.equal(tasks.length,4);assert.equal(d.clearRoute(a.路線ID,date,tasks).removalsAdded,0);
 const payload=d.payload(()=> 'clear-vehicle');assert.equal(payload.items.filter(x=>x.action==='remove').length,2);d.clear();assert.equal(d.size(),0);
});

test('all-selection uses the selected time window, follows range changes, and can be cancelled again',()=>{
 const {emit,node,panel,cards,setWindow}=assignmentHarness({visible:[a.站點ID]});
 emit('achang:focus-route-stop',{id:a.站點ID,route:a.車次,all:true,stopIds:[a.站點ID]});assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,1);assert.equal(node('routeTitle').children.at(-1).textContent,'（站點已全選）');assert.doesNotMatch(panel().innerHTML,/route-assignment-target|<h3>/);
 setWindow([b.站點ID]);emit('achang:directory-route',{route:a.車次});assert.equal(cards[0].states.has('assignment-target'),false);assert.equal(cards[1].states.has('assignment-target'),true);assert.equal(node('routeTitle').children.at(-1).textContent,'（站點已全選）');
 emit('achang:focus-route-stop',{id:b.站點ID,route:a.車次,all:true,stopIds:[b.站點ID]});assert.equal(cards.filter(c=>c.states.has('assignment-target')).length,0);assert.equal(panel().hidden,true);assert.equal(node('routeTitle').children.at(-1).textContent,'（點擊全選站點）');
});

test('database duplicate reservation messages become a readable conflict while the draft is retained',async()=>{
 const fake={...L,rest:async path=>({ok:!path.startsWith('rpc/'),data:path.startsWith('rpc/')?{code:'23505',message:'duplicate key value violates unique constraint "achang_one_shift_per_day"'}:[]})};
 await assert.rejects(()=>saveBatch({batchId:'3bc211b4-bc21-4cd7-a7c2-a960958a96d4',items:[{volunteerId:person.id,stopId:a.站點ID,date:'2026-11-03'}]},{token:'admin'},fake),e=>e.status===409&&e.message.includes('其他有效排班')&&!e.message.includes('duplicate key'));
});
