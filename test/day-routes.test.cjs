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

test('32-row source enables 25 reviewed rows and keeps all seven cross-source items pending',()=>{
 const normalized=adapter.normalize(source);assert.equal(normalized.length,32);assert.equal(normalized.filter(row=>row.enabled).length,25);
 assert.deepEqual(normalized.filter(row=>!row.enabled).map(row=>row.id),[
  'ACHANG-W三-A-02','ACHANG-W三-A-06','ACHANG-W三-B-10','ACHANG-W三-B-11','ACHANG-W五-A-17','ACHANG-W五-A-23','ACHANG-W五-A-24'
 ]);
 assert.ok(normalized.filter(row=>!row.enabled).every(row=>row.pendingReasons.includes('來源衝突待核')&&row.reviewNote));
 for(const [date,weekday,count,pending] of [['2026-10-28','星期三',12,4],['2026-10-30','星期五',13,3]]){
  const result=adapter.stopsForDate(source,date);assert.equal(result.weekday,weekday);assert.equal(result.stops.length,count);
  assert.equal(result.pending.length,pending);assert.equal(result.serviceNotice,'遇國定假日、颱風假停收');
  assert.deepEqual([...result.stops].sort((a,b)=>a['到達'].localeCompare(b['到達'])||a['來源順序']-b['來源順序']),result.stops);
  assert.deepEqual([...new Set(result.stops.map(row=>row['路線ID']))].sort(),[`DAY:${weekday}:A`,`DAY:${weekday}:B`]);
  assert.ok(result.stops.every(row=>row['時段']==='日間'&&row['車牌']===''&&row['固定日間']===true));
 }
});

test('an explicit service exception closes only the selected date without inventing a holiday calendar',()=>{
 const fixture={...source,service_exceptions:[{date:'2026-10-28',closed:true,reason:'國定假日停收'}]};
 const closed=adapter.stopsForDate(fixture,'2026-10-28'),next=adapter.stopsForDate(fixture,'2026-10-30');
 assert.equal(closed.stops.length,0);assert.equal(closed.closedReason,'國定假日停收');assert.equal(closed.pending.length,4);
 assert.equal(next.stops.length,13);assert.equal(next.closedReason,'');
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

test('frontend and backend keep route identity separate from an optional truck number',()=>{
 assert.match(html,/day-routes\.js/);assert.match(sw,/data-day-routes-20250402\.json/);
 assert.match(app,/fetch\('\.\/data-day-routes-20250402\.json'/);
 assert.match(app,/r\['固定日間'\]\?plannerArea!=='all'/);
 assert.match(app,/本日另有.*來源待確認，未列入排班/);
 assert.match(app,/routeId:first\['路線ID'\]\|\|first\['車牌'\]\|\|first\['車次'\]/);
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
