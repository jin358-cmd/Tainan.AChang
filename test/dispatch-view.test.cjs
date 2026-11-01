const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../dispatch-view');
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
const monday=new Date('2026-11-01T23:00:00Z'); // Monday 07:00 Taiwan, Sunday UTC
const row=(route,order,at,days='一、二、四、六',extra={})=>({'車次':route,'清運次序':order,'到達':at,'垃圾日':days,...extra});
test('Taiwan service date and weekday do not inherit the server timezone',()=>{
 assert.deepEqual(V.clock(monday),{day:'2026-11-02',hhmm:'07:00',minutes:420,weekday:'一'});
 assert.equal(V.clock(new Date('2026-11-02T16:01:00Z')).day,'2026-11-03');
});
test('upcoming four follow directory vehicle order, preserve source order and never repeat past stops',()=>{
 const rows=[row('日間2',1,'07:01'),row('日間1',1,'06:59'),row('日間1',2,'07:00'),row('日間1',3,'07:10'),row('日間1',4,'07:30'),row('日間1',5,'07:50'),row('日間1',6,'99:99')];
 assert.deepEqual(V.nextStops(rows,monday).map(r=>[r['車次'],r['清運次序']]),[['日間1',2],['日間1',3],['日間1',4],['日間1',5]]);
 assert.equal(rows[0]['車次'],'日間2');
 assert.deepEqual(V.nextStops(rows,new Date('2026-11-02T00:00:00Z')),[]);
});
test('a current fixed stop remains visible until departure; excluded and non-service rows stay hidden',()=>{
 const rows=[row('日間1',1,'06:50','一二四六',{'離開':'07:05'}),row('日間1',2,'07:10','三五'),row('日間1',3,'07:20','一二四六',{'來源刪除線':true}),row('日間1',4,'07:30')];
 assert.deepEqual(V.nextStops(rows,monday).map(r=>r['清運次序']),[1,4]);
 assert.equal(V.nextStops(rows,new Date('2026-11-01T00:00:00Z')).length,0);
});
test('source position wins over repeated printed stop numbers and overlays retain their merged position',()=>{
 const rows=[row('日間5',1,'07:10','一二四六',{'來源順序':3}),row('日間5',2,'07:00','一二四六',{'來源順序':2}),row('日間5',1,'07:00','一二四六',{'來源順序':1})];
 assert.deepEqual(V.sortStops(rows).map(r=>r['來源順序']),[1,2,3]);
 assert.deepEqual(['夜間10','日間6','夜間2','日間1'].sort(V.compareRoutes),['日間1','日間6','夜間2','夜間10']);
});
test('all people remain present in owner area order, with both 神州 spellings and stable roster order',()=>{
 const people=[{id:1,assignment:'光復里'},{id:2,assignment:'神州里'},{id:3,assignment:''},{id:4,assignment:'復華里'},{id:5,assignment:'勝利里'},{id:6,assignment:'復華里'}];
 assert.deepEqual(V.sortPeople(people).map(p=>p.id),[4,6,5,2,1,3]);assert.equal(people[0].id,1);
});
test('a cross-area assignment matches the precise route and stop without changing the original people area',()=>{
 const r={...row('日間1',3,'07:10'),'時段':'日間','路線ID':'PDF:日間:日間1:KEP','里別':'復國里','停靠點原文':'國華街110號'};
 const t={visit_date:'2026-11-02',shift:'日間',route_id:r['路線ID'],area:'復華里',stop_address:r['停靠點原文'],stop_order:3};
 assert.equal(V.taskMatchesStop(t,r,'2026-11-02'),true);
 assert.equal(V.taskMatchesStop({...t,stop_order:4},r,'2026-11-02'),false);
 assert.equal(V.taskMatchesStop({...t,route_id:'other'},r,'2026-11-02'),false);
 assert.equal(V.taskMatchesStop(t,r,'2026-11-03'),false);assert.equal(t.area,'復華里');
});
test('the actual person picker lists every member directly, keeps busy people visible and disables them',()=>{
 const members=[{id:'b',name:'中興測試',assignment:'中興里'},{id:'f',name:'復華測試',assignment:'復華里'},{id:'s',name:'勝利測試',assignment:'勝利里'},{id:'u',name:'尚未分區測試',assignment:''}];
 let result;const context={state:{people:members},window:{AChangDispatchView:V,__pendingStop:'stop'},data:{stops:[{}]},areas:['復華里','勝利里','中興里'],stopKey:()=> 'stop',assignmentRouteToken:()=> 'route',serviceAreaLabel:V.area,esc:String,bookingFor:id=>id==='b'?{}:null,matchedMemberTask:()=>null,showModal:(title,html)=>result={title,html},$:()=>({classList:{toggle(){}}})};
 vm.createContext(context);vm.runInContext(app.slice(app.indexOf('function pick(kind,opts)'),app.indexOf('\nfunction editPerson('))+'\npick("stop",{title:"指派人員"});',context);
 assert.equal(result.title,'指派人員');assert.ok(result.html.indexOf('復華測試')<result.html.indexOf('勝利測試'));assert.ok(result.html.indexOf('勝利測試')<result.html.indexOf('中興測試'));
 assert.match(result.html,/data-pick-id="b" disabled/);assert.match(result.html,/尚未分區測試/);assert.doesNotMatch(result.html,/選擇指派里別|data-stop-assignment-area/);
});
test('the actual assignment posts one task under the selected person original area and does not change the roster',async()=>{
 const member={id:'person',assignment:'復華里'},row={'時段':'日間','車牌':'KEP','停靠點原文':'來源其他里站點','到達':'07:10','離開':'07:25'};const writes=[];
 const context={state:{people:[member]},data:{stops:[row]},areas:['復華里'],assertAdmin:()=>true,sourceExcluded:()=>false,stopKey:()=> 'stop',assignmentRouteToken:()=> 'route',bookingFor:()=>null,sourceOrderForTask:()=>3,date:'2026-11-02',doLive:fn=>fn(),onlineApi:(...args)=>writes.push(args),toast:message=>assert.fail(message)};
 vm.createContext(context);vm.runInContext(app.match(/^addStopVolunteer=async function\(key,id\).*$/m)[0],context);await context.addStopVolunteer('stop','person');
 assert.equal(writes.length,1);assert.equal(writes[0][0],'tasks');assert.equal(writes[0][1],'POST');assert.equal(writes[0][2].area,'復華里');assert.equal(writes[0][2].address,row['停靠點原文']);assert.equal(member.assignment,'復華里');
});
test('the actual task projection restores cross-area member chips to their original source stop',()=>{
 const row={'時段':'日間','路線ID':'route','車牌':'KEP','里別':'復國里','清運次序':'3','停靠點原文':'國華街110號'};
 const context={state:{plans:{}},data:{stops:[row]},liveTasks:[{visit_date:'2026-11-02',shift:'日間',route_id:'route',area:'復華里',volunteer_id:'person',stop_address:row['停靠點原文'],stop_order:3,status:'待訪'}],taskRouteToken:t=>t.route_id,routeKey:()=> '日間|route|KEP',stopKey:()=> 'stop'};
 vm.createContext(context);vm.runInContext(app.slice(app.indexOf('function syncTaskProjection(){'),app.indexOf('\nasync function refreshOnline('))+'\nsyncTaskProjection();',context);
 assert.equal(context.state.plans['2026-11-02|日間|route|KEP'].stops.stop.people[0],'person');
});
