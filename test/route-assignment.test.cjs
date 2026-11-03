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
