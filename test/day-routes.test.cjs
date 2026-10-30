'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),adapter=require('../day-routes.js');
const source=require('../data-day-routes-20250402.json');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),tasks=fs.readFileSync(path.join(root,'api/tasks.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');

test('Taipei calendar dates select only Wednesday and Friday fixed daytime catalogs',()=>{
 assert.equal(adapter.weekdayForDate('2026-10-28'),'星期三');
 assert.equal(adapter.weekdayForDate('2026-10-30'),'星期五');
 assert.equal(adapter.weekdayForDate('2026-10-29'),'星期四');
 assert.equal(adapter.stopsForDate(source,'2026-10-29').stops.length,0);
});

test('114.4.2 notice enables all 32 rows while retaining prior review notes for audit',()=>{
 const normalized=adapter.normalize(source);assert.equal(normalized.length,32);assert.equal(normalized.filter(row=>row.enabled).length,32);
 assert.deepEqual(normalized.filter(row=>!row.enabled),[]);
 assert.equal(source.routes.filter(row=>row.review_note).length,7);
 assert.ok(source.routes.filter(row=>row.review_note).every(row=>row.review_required===false&&row.review_note.includes('保留')));
 for(const [date,weekday] of [['2026-10-28','星期三'],['2026-10-30','星期五']]){
  const result=adapter.stopsForDate(source,date);assert.equal(result.weekday,weekday);
  assert.equal(result.stops.length,16);assert.equal(result.pending.length,0);assert.equal(result.serviceNotice,'遇國定假日、颱風假停收');
  assert.deepEqual(result.stops.map(row=>row['來源順序']),normalized.filter(row=>row.enabled&&row.weekday===weekday).map(row=>row.sourceOrder));
  assert.deepEqual([...new Set(result.stops.map(row=>row['路線ID']))].sort(),[`DAY:${weekday}:A`,`DAY:${weekday}:B`]);
  assert.deepEqual([...new Set(result.stops.map(row=>row['車次']))].sort(),['日間 A線','日間 B線']);
  assert.deepEqual(result.stops.filter(row=>row['車次']==='日間 A線').map(row=>row['清運次序']),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(result.stops.filter(row=>row['車次']==='日間 B線').map(row=>row['清運次序']),[1,2,3,4,5,6,7,8]);
  assert.ok(result.stops.every(row=>row['時段']==='日間'&&row['車牌']===''&&row['固定日間']===true));
 }
 assert.equal(source.routes.find(row=>row.id==='ACHANG-W三-A-06').name,'北灣里國聖宮');
 assert.equal(source.routes.find(row=>row.id==='ACHANG-W三-B-11').name,'永明街261-12號(如意居)');
 assert.equal(source.routes.find(row=>row.id==='ACHANG-W三-B-14').name,'國光八街&大勇路(9-1公園)');
 assert.equal(source.routes.find(row=>row.id==='ACHANG-W五-A-17').name,'中山南路544巷48號(統領國)');
 assert.equal(source.routes.find(row=>row.id==='ACHANG-W五-B-27').name,'塩興里(桂田停車場)');
 assert.equal(source.routes.find(row=>row.id==='ACHANG-W五-B-29').name,'大灣三街&大安街口');
});

test('an explicit service exception closes only the selected date without inventing a holiday calendar',()=>{
 const fixture={...source,service_exceptions:[{date:'2026-10-28',closed:true,reason:'國定假日停收'}]};
 const closed=adapter.stopsForDate(fixture,'2026-10-28'),next=adapter.stopsForDate(fixture,'2026-10-30');
 assert.equal(closed.stops.length,0);assert.equal(closed.closedReason,'國定假日停收');assert.equal(closed.pending.length,0);
 assert.equal(next.stops.length,16);assert.equal(next.closedReason,'');
});

test('single times stay single, intervals stay intervals, and uncertain rows remain pending',()=>{
 const fixture={routes:[
  {id:'ok-single',weekday:'星期三',route:'A',start:'08:00',end:'',name:'單時間',review_required:false},
  {id:'ok-range',weekday:'星期三',route:'A',start:'08:10',end:'08:20',name:'區間',review_required:false},
  {id:'conflict',weekday:'星期三',route:'B',start:'09:00',end:'',name:'衝突',review_required:true},
  {id:'unknown-day',weekday:'',route:'B',start:'09:10',end:'',name:'缺星期',review_required:false}
 ]};
 const result=adapter.stopsForDate(fixture,'2026-10-28');assert.equal(result.stops.length,2);assert.equal(result.pending.length,1);
 assert.equal(result.stops[0]['離開'],'');assert.equal(result.stops[1]['離開'],'08:20');
 assert.deepEqual(result.pending.map(row=>row.id),['conflict']);
 assert.equal(adapter.normalize(fixture).find(row=>row.id==='unknown-day').enabled,false);
});

test('day adapter preserves document order instead of numerically or chronologically re-sorting stops',()=>{
 const fixture={routes:[
  {id:'late-first',weekday:'星期三',route:'A',start:'14:40',end:'',name:'原表第一筆'},
  {id:'early-second',weekday:'星期三',route:'A',start:'04:59',end:'',name:'原表第二筆'}
 ]};
 const result=adapter.stopsForDate(fixture,'2026-10-28');
 assert.deepEqual(result.stops.map(row=>row['站點ID']),['late-first','early-second']);
 assert.deepEqual(result.stops.map(row=>row['清運次序']),[1,2]);
});

test('frontend and backend keep route identity separate from an optional truck number',()=>{
 assert.match(html,/day-routes\.js/);assert.match(html,/route-time-filter\.js/);assert.match(sw,/data-day-routes-20250402\.json/);assert.match(sw,/route-time-filter\.js/);
 assert.match(app,/fetch\('\.\/data-day-routes-20250402\.json'/);
 assert.match(app,/r\['固定日間'\]\?true:plannerArea==='all'/);
 assert.match(app,/本日另有.*來源待確認，未列入排班/);
 assert.match(app,/fixedDay\?dayCatalogStatus\.notice:''/);
 assert.match(html,/<p id="visitTimeHint" class="mini-note"><\/p>/);
 assert.doesNotMatch(app,/僅以原表合法時間過濾，不變更站點內容與順序/);
 assert.doesNotMatch(app,/本日可排.*matching\.length.*站次/);
 assert.match(app,/全部里別僅供預覽；指派前請選擇服務里/);
 assert.match(app,/人員會跟巡整條官方路線/);
 assert.match(app,/visitTitle\.textContent=rows\.length\?`依車次順序拜訪・共 \$\{rows\.length\} 站點`/);
 assert.match(app,/classList\.toggle\('planner-picker-open',kind==='team'\|\|kind==='stop'\)/);
 assert.match(app,/areaLabel=r\['固定日間'\]\?'站點里別待核':area\|\|'未指定服務里'/);
 assert.doesNotMatch(app,/areas\.indexOf\(selectedArea\)/);
 assert.match(app,/areaPage=Math\.floor\(serviceAreaIndex\(selectedArea\)\/CARD_PAGE_SIZE\)/);
 assert.match(app,/canAssign=!excluded&&\(plannerArea==='all'\|\|available\.length>0\)/);
 assert.match(app,/data-stop-assignment-area/);
 assert.match(app,/area=window\.__pendingStopArea\|\|rowArea\(row\)/);
 assert.match(app,/assignBtn\.disabled=!teamArea/);
 assert.match(app,/const first=rows\[0\],last=rows\.at\(-1\),route=assignmentRouteToken\(first\)/);assert.match(app,/routeId:route/);
 assert.match(app,/bookingFor\(id,route\)/);assert.match(app,/rosterAvailable\(a,allowedRoute=''\)/);
 assert.match(app,/stopOrder:sourceOrderForTask\(r\)/);
 assert.match(app,/原表刪除線・僅供來源追溯，不可指派/);
 assert.match(app,/schedulableRouteRows\(\)\.filter/);
 assert.match(tasks,/const truck=String\(b\.truck\|\|''\)\.trim\(\)/);
 assert.match(tasks,/route_id:routeId,truck_number:truck\|\|null,starts_at:arrival,ends_at:routeEnd/);
 assert.match(tasks,/route_id:p\.route_id\|\|p\.truck_number\|\|''/);
});

test('actual tasks handler persists a fixed daytime route with no fabricated plate and rolls its end time forward',async()=>{
 const serverPath=require.resolve('../lib/server'),handlerPath=require.resolve('../api/tasks');
 const originalServer=require.cache[serverPath],originalHandler=require.cache[handlerPath];
 const writes=[];
 const fake={
  run:fn=>fn,
  method:(req,allowed)=>assert.ok(allowed.includes(req.method)),
  authorized:async()=>({role:'admin',token:'scoped-user-token'}),
  body:req=>req.body,
  uuid:value=>value,
  checkText:(value,label)=>{assert.equal(typeof value,'string',label);assert.ok(value.trim(),label);return value.trim()},
  validDate:value=>value,
  time:value=>{assert.match(value,/^\d{2}:\d{2}$/);return value},
  problem:(status,message)=>{throw Object.assign(new Error(message),{status})},
  need:(result,message)=>{assert.equal(result.ok,true,message);return result.data},
  rest:async(path,token,options={})=>{
   assert.equal(token,'scoped-user-token');writes.push({path,options});
   if(path.startsWith('service_allocations?'))return {ok:true,data:[{member_id:'member'}]};
   if(path.startsWith('assignments?member_id=eq.'))return {ok:true,data:[]};
   if(path==='assignments?select=id')return {ok:true,status:201,data:[{id:'assignment'}]};
   if(path==='visit_tasks?select=id')return {ok:true,status:201,data:options.body.map((_,index)=>({id:`task-${index+1}`}))};
   throw new Error(`unexpected REST path: ${path}`);
  },
  json:(res,status,body)=>{res.statusCode=status;res.body=body}
 };
 try{
  require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake};delete require.cache[handlerPath];
  const handler=require(handlerPath),res={};
  await handler({method:'POST',body:{volunteerId:'member',area:'成功里',date:'2026-10-28',shift:'日間',routeId:'DAY:星期三:A',truck:'',routeEnd:'15:15',stops:[{address:'第一站',time:'09:15',stopOrder:1},{address:'第二站',time:'10:00',stopOrder:2}]}},res);
  assert.equal(res.statusCode,201);assert.deepEqual(res.body,{ok:true,taskIds:['task-1','task-2']});
  const assignment=writes.find(entry=>entry.path==='assignments?select=id').options.body;
  assert.deepEqual(assignment,{member_id:'member',service_date:'2026-10-28',shift:'day',village:'成功里',route_id:'DAY:星期三:A',truck_number:null,starts_at:'09:15',ends_at:'15:15'});
  const visits=writes.find(entry=>entry.path==='visit_tasks?select=id').options.body;
  assert.deepEqual(visits.map(row=>[row.visit_address,row.scheduled_at,row.stop_order]),[['第一站','2026-10-28T09:15:00+08:00',1],['第二站','2026-10-28T10:00:00+08:00',2]]);
 }finally{
  delete require.cache[handlerPath];if(originalHandler)require.cache[handlerPath]=originalHandler;
  if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath];
 }
});

test('tasks handler appends adjacent stops to the same route without duplicating its assignment or original task',async()=>{
 const serverPath=require.resolve('../lib/server'),handlerPath=require.resolve('../api/tasks');
 const originalServer=require.cache[serverPath],originalHandler=require.cache[handlerPath],writes=[];
 const existing={id:'assignment-1',member_id:'member',service_date:'2026-10-30',shift:'day',village:'復華里',route_id:'DAY-4',truck_number:'KEP-5860',starts_at:'06:50:00',ends_at:'07:05:00'};
 const fake={run:fn=>fn,method:()=>{},authorized:async()=>({role:'admin',token:'token'}),body:req=>req.body,uuid:x=>x,checkText:x=>String(x).trim(),validDate:x=>x,time:x=>x,
  problem:(status,message)=>{throw Object.assign(new Error(message),{status})},need:(r,message)=>{assert.equal(r.ok,true,message);return r.data},json:(res,status,body)=>{res.statusCode=status;res.body=body},
  rest:async(path,token,opt={})=>{writes.push({path,opt});assert.equal(token,'token');
   if(path.startsWith('service_allocations?'))return {ok:true,data:[{member_id:'member'}]};
   if(path.startsWith('assignments?member_id=eq.'))return {ok:true,data:[existing]};
   if(path.startsWith('visit_tasks?assignment_id=eq.'))return {ok:true,data:[{id:'task-original',visit_address:'文化路96之1號',stop_order:2,scheduled_at:'2026-10-30T06:50:00+08:00'}]};
   if(path==='visit_tasks?select=id'){assert.deepEqual(opt.body.map(row=>[row.assignment_id,row.visit_address,row.stop_order,row.scheduled_at]),[['assignment-1','國華街110號(活動中心)',3,'2026-10-30T07:10:00+08:00']]);return {ok:true,status:201,data:[{id:'task-new'}]}}
   if(path==='assignments?id=eq.assignment-1'){assert.deepEqual(opt.body,{starts_at:'06:50',ends_at:'07:25',updated_at:opt.body.updated_at});assert.match(opt.body.updated_at,/Z$/);return {ok:true,data:[]}}
   throw new Error('unexpected '+path);
  }};
 try{require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake};delete require.cache[handlerPath];const handler=require(handlerPath),res={};
  await handler({method:'POST',body:{volunteerId:'member',area:'復華里',date:'2026-10-30',shift:'日間',routeId:'DAY-4',truck:'KEP-5860',routeEnd:'07:25',address:'國華街110號(活動中心)',time:'07:10',stopOrder:3}},res);
  assert.equal(res.statusCode,201);assert.deepEqual(res.body,{ok:true,taskIds:['task-new'],reused:true});assert.equal(writes.filter(x=>x.path==='assignments?select=id').length,0);
 }finally{delete require.cache[handlerPath];if(originalHandler)require.cache[handlerPath]=originalHandler;if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath]}
});

test('tasks handler is idempotent for an existing stop and rejects a conflicting route in the same day shift',async()=>{
 const serverPath=require.resolve('../lib/server'),handlerPath=require.resolve('../api/tasks');const originalServer=require.cache[serverPath],originalHandler=require.cache[handlerPath];
 const invoke=async(routeId)=>{const writes=[],fake={run:fn=>fn,method:()=>{},authorized:async()=>({role:'admin',token:'token'}),body:req=>req.body,uuid:x=>x,checkText:x=>String(x).trim(),validDate:x=>x,time:x=>x,problem:(status,message)=>{throw Object.assign(new Error(message),{status})},need:(r)=>r.data,json:(res,status,body)=>{res.statusCode=status;res.body=body},rest:async(path,token,opt={})=>{writes.push({path,opt});if(path.startsWith('service_allocations?'))return {ok:true,data:[{}]};if(path.startsWith('assignments?member_id=eq.'))return {ok:true,data:[{id:'assignment-1',village:'復華里',route_id:'DAY-4',starts_at:'06:50:00',ends_at:'07:25:00'}]};if(path.startsWith('visit_tasks?assignment_id=eq.'))return {ok:true,data:[{id:'task-original',visit_address:'文化路96之1號',stop_order:2,scheduled_at:'2026-10-30T06:50:00+08:00'}]};throw new Error('unexpected '+path)}};
  require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake};delete require.cache[handlerPath];const handler=require(handlerPath),res={};let error;try{await handler({method:'POST',body:{volunteerId:'member',area:'復華里',date:'2026-10-30',shift:'日間',routeId,truck:routeId==='DAY-4'?'KEP-5860':'OTHER',routeEnd:'07:05',address:'文化路96之1號',time:'06:50',stopOrder:2}},res)}catch(e){error=e}return {res,error,writes}};
 try{const same=await invoke('DAY-4');assert.equal(same.res.statusCode,200);assert.deepEqual(same.res.body,{ok:true,taskIds:['task-original'],reused:true});assert.equal(same.writes.some(x=>x.opt.method==='POST'),false);
  const overlap=await invoke('OTHER-ROUTE');assert.equal(overlap.error?.status,409);assert.match(overlap.error.message,/已有其他跟巡排班/);assert.equal(overlap.writes.some(x=>x.opt.method==='POST'),false);
 }finally{delete require.cache[handlerPath];if(originalHandler)require.cache[handlerPath]=originalHandler;if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath]}
});

test('single-station removal keeps the same volunteer assigned to other stops on the route',async()=>{
 const serverPath=require.resolve('../lib/server'),handlerPath=require.resolve('../api/tasks'),originalServer=require.cache[serverPath],originalHandler=require.cache[handlerPath],writes=[];
 const fake={run:fn=>fn,method:()=>{},authorized:async()=>({role:'admin',token:'token'}),body:req=>req.body,uuid:x=>x,getOne:async()=>({id:'task-one',assignment_id:'assignment-one',member_id:'member',status:'incomplete'}),problem:(status,message)=>{throw Object.assign(new Error(message),{status})},need:(r,message)=>{assert.equal(r.ok,true,message);return r.data},json:(res,status,body)=>{res.statusCode=status;res.body=body},rest:async(path,token,opt={})=>{writes.push({path,opt});if(path.startsWith('visit_tasks?assignment_id=eq.assignment-one'))return {ok:true,data:[{id:'task-one',status:'incomplete'},{id:'task-two',status:'incomplete'}]};if(path==='visit_tasks?id=eq.task-one')return {ok:true,data:[]};throw new Error('unexpected '+path)}};
 try{require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake};delete require.cache[handlerPath];const handler=require(handlerPath),res={};await handler({method:'DELETE',body:{id:'task-one',scope:'stop'}},res);assert.equal(res.statusCode,200);assert.deepEqual(res.body,{ok:true,scope:'stop',assignmentRetained:true});assert.ok(writes.some(x=>x.path==='visit_tasks?id=eq.task-one'&&x.opt.method==='DELETE'));assert.equal(writes.some(x=>x.path.startsWith('assignments?id=')),false)}finally{delete require.cache[handlerPath];if(originalHandler)require.cache[handlerPath]=originalHandler;if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath]}
});

test('removing the final incomplete stop cleans up only its now-empty assignment',async()=>{
 const serverPath=require.resolve('../lib/server'),handlerPath=require.resolve('../api/tasks'),originalServer=require.cache[serverPath],originalHandler=require.cache[handlerPath],writes=[];
 const fake={run:fn=>fn,method:()=>{},authorized:async()=>({role:'admin',token:'token'}),body:req=>req.body,uuid:x=>x,getOne:async()=>({id:'task-one',assignment_id:'assignment-one',member_id:'member',status:'incomplete'}),problem:(status,message)=>{throw Object.assign(new Error(message),{status})},need:(r)=>r.data,json:(res,status,body)=>{res.statusCode=status;res.body=body},rest:async(path,token,opt={})=>{writes.push({path,opt});if(path.startsWith('visit_tasks?assignment_id=eq.assignment-one'))return {ok:true,data:[{id:'task-one',status:'incomplete'}]};if(path==='assignments?id=eq.assignment-one')return {ok:true,data:[]};throw new Error('unexpected '+path)}};
 try{require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake};delete require.cache[handlerPath];const handler=require(handlerPath),res={};await handler({method:'DELETE',body:{id:'task-one',scope:'stop'}},res);assert.deepEqual(res.body,{ok:true,scope:'stop',assignmentRetained:false});assert.ok(writes.some(x=>x.path==='assignments?id=eq.assignment-one'&&x.opt.method==='DELETE'))}finally{delete require.cache[handlerPath];if(originalHandler)require.cache[handlerPath]=originalHandler;if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath]}
});

test('completed station history cannot be removed through the station chip',async()=>{
 const serverPath=require.resolve('../lib/server'),handlerPath=require.resolve('../api/tasks'),originalServer=require.cache[serverPath],originalHandler=require.cache[handlerPath];
 const fake={run:fn=>fn,method:()=>{},authorized:async()=>({role:'admin',token:'token'}),body:req=>req.body,uuid:x=>x,getOne:async()=>({id:'task-one',assignment_id:'assignment-one',member_id:'member',status:'completed'}),problem:(status,message)=>{throw Object.assign(new Error(message),{status})},json:()=>{}};
 try{require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake};delete require.cache[handlerPath];const handler=require(handlerPath);await assert.rejects(()=>handler({method:'DELETE',body:{id:'task-one',scope:'stop'}},{}),error=>error.status===409&&/保留任務紀錄/.test(error.message))}finally{delete require.cache[handlerPath];if(originalHandler)require.cache[handlerPath]=originalHandler;if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath]}
});
