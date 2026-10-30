'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

async function loadHandler(role='admin'){
 const serverPath=require.resolve('../lib/server'),handlerPath=require.resolve('../api/route-stops');
 const originalServer=require.cache[serverPath],originalHandler=require.cache[handlerPath],calls=[];
 const fake={
  run:fn=>fn,method:(req,allowed)=>assert.ok(allowed.includes(req.method)),
  authorized:async(req,res,roles)=>{calls.push({kind:'authorized',roles});if(!roles.includes(role))throw Object.assign(new Error('此帳號沒有操作權限'),{status:403});return {token:'actor-token'}},
  body:req=>req.body,uuid:x=>x,checkText:(x)=>String(x),time:x=>x,
  rest:async(path,token,opt={})=>{calls.push({kind:'rest',path,token,opt});return {ok:true,data:path.startsWith('rpc/')?[{id:'overlay-id',status:opt.body.p_action==='archive'?'archived':'active'}]:[]}},
  need:r=>r.data,json:(res,status,body)=>{res.status=status;res.body=body},problem:(status,message)=>{throw Object.assign(new Error(message),{status})}
 };
 require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake};delete require.cache[handlerPath];
 const handler=require('../api/route-stops');
 return {handler,calls,restore(){delete require.cache[handlerPath];if(originalHandler)require.cache[handlerPath]=originalHandler;if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath]}};
}

test('route stop API authorizes only admins and forwards bounded create to atomic RPC',async()=>{
 const x=await loadHandler();try{const res={};await x.handler({method:'POST',body:{action:'create',shift:'日間',routeToken:'日間4',vehicle:'KER-3760',area:'勝利里',stopName:'二王廟前',startTime:'06:30',endTime:'06:45',displayOrder:1}},res);assert.equal(res.status,201);assert.deepEqual(x.calls[0].roles,['admin']);const rpc=x.calls.find(c=>c.path?.startsWith('rpc/'));assert.equal(rpc.path,'rpc/achang_route_stop_overlay_mutate');assert.equal(rpc.opt.body.p_stop_name,'二王廟前');assert.equal(rpc.opt.body.p_display_order,1)}finally{x.restore()}
});

test('volunteer is rejected before any route stop read or mutation',async()=>{
 const x=await loadHandler('volunteer');try{await assert.rejects(()=>x.handler({method:'GET'},{}),error=>error.status===403);assert.equal(x.calls.some(c=>c.kind==='rest'),false)}finally{x.restore()}
});

test('migration keeps overlays soft-deletable, audited, RLS protected and seeds two owner-authorized stops',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261029195500_achang_route_stop_overlays.sql'),'utf8');
 assert.match(sql,/enable row level security/);assert.match(sql,/app_private\.is_admin\(\)/);assert.match(sql,/status='archived'/);assert.match(sql,/route_stop_overlay_events/);assert.match(sql,/revoke all on function[\s\S]*from public,anon/);
 assert.match(sql,/'日間4','KER-3760','勝利里','二王廟前','06:30','06:45',1/);assert.match(sql,/'日間6','AAQ-059','大橋里','大橋一街103巷口','06:52','06:54',1/);
});

test('day 6 reorder keeps the original PDF first stop and records a reversible audit snapshot',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261029200500_reorder_day6_owner_overlay.sql'),'utf8');
 assert.match(sql,/display_order = 2/);
 assert.match(sql,/position_before_source_id = 'PDF:DAY:0159'/);
 assert.match(sql,/'reordered'/);
 assert.match(sql,/'before',to_jsonb\(v_before\)/);
 assert.match(sql,/'after',to_jsonb\(v_after\)/);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.route_stop_overlays/i);
});

test('planner initializes the selected shift as daytime without overriding later click state',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(app,/shift='日間'/);
 assert.match(html,/class="shift on" data-shift="日間"/);
 assert.match(app,/\$\$\('\[data-shift\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{shift=b\.dataset\.shift/);
 assert.doesNotMatch(app,/renderPlanner\(\)[\s\S]{0,80}shift='日間'/);
});

test('route-time preferences are local, bounded, subject-isolated, and never business data',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.match(app,/VISIT_TIME_PREF_KEY = 'achang-visit-time-preferences-v1'/);
 assert.match(app,/visitPreferenceSubject\(\)[\s\S]*Math\.imul\(hash,16777619\)/);
 assert.match(app,/group==='ab'\?`weekday-\$\{visitPreferenceWeekday\(\)\}`:'all-dates'/);
 assert.match(app,/slice\(0,100\)/);
 assert.match(app,/rememberVisitTimePreference\(\);renderPlanner\(\)/);
 assert.doesNotMatch(app,/onlineApi\([^\n]*visitTimePreference/i);
});

test('frontend distinguishes immutable PDF rows from active overlay total and defaults all-village preview safely',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.match(app,/plannerArea='all'/);assert.match(app,/dayShiftWindow\(\)\{return shift==='日間'&&dayRouteCategory==='six'\?\{start:'',end:'08:05'\}/);assert.match(app,/原始 PDF 160 筆保持不變/);assert.match(app,/plannerArea!=='all'\?rosterAvailable\(area,assignmentRouteToken\(r\)\):\[\]/);
});
