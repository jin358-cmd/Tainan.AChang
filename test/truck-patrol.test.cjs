const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('../truck-patrol'),routes=require('../official-routes');
const rows=[...routes.normalize(require('../data-official-day-20261030.source.json'),'日間'),...routes.normalize(require('../data-official-night-20261030.source.json'),'夜間')];
test('excludes leading @ including whitespace and full-width; preserves roster order and IDs',()=>{
 const people=[{id:'1',name:'乙'},{id:'2',name:' @測試'},{id:'3',name:' ＠測試'},{id:'4',name:'甲'},{id:'4',name:'duplicate'},{id:'5',name:''},{id:'6',name:'王@明'}];
 assert.deepEqual(api.eligible(people).map(p=>p.name),['乙','甲','王@明']);assert.equal(people.length,7);
});
test('39 eligible members allocate 35 unique slots with 4 waiting; no fabrication on short roster',()=>{
 const people=Array.from({length:39},(_,i)=>({id:String(i+1),name:'志工'+i}));people.splice(2,0,{id:'blocked',name:'@排除'});
 const plan=api.build(rows,people),assigned=plan.groups.flatMap(g=>g.people);
 assert.equal(plan.total,39);assert.equal(plan.excluded,1);assert.equal(assigned.length,35);assert.equal(new Set(assigned.map(p=>p.id)).size,35);assert.equal(plan.waiting.length,4);
 assert.equal(api.build(rows,people.slice(0,2)).groups.flatMap(g=>g.people).length,2);
});
test('only seven requested day/night routes and five villages; original PDF order preserved',()=>{
 const plan=api.build(rows,[]);assert.equal(plan.groups.length,7);
 for(const group of plan.groups){assert.ok(group.stops.length>0);assert.ok(group.stops.every(r=>api.areas.includes(r['里別'])&&r['車次']===group.route&&r['時段']===group.shift));assert.deepEqual(group.stops,rows.filter(r=>r['車次']===group.route&&r['時段']===group.shift&&api.areas.includes(r['里別'])&&!r['來源刪除線']));}
 assert.equal(plan.groups.find(g=>g.route==='夜間35').links,null);
 assert.match(plan.groups.find(g=>g.route==='夜間22').links.map,/dbid=6971338935&ddsPageID=LINEPIC/);
});
test('private names are only supplied by an authenticated admin roster, not synthetic preview',()=>{
 const fs=require('node:fs'),app=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
 assert.match(app,/authenticated=liveRole==='admin'&&!previewDemoMode/);
 assert.match(app,/people=authenticated\?\(truckRosterSnapshot\|\|state.people\):\[\]/);
 assert.match(app,/truckRosterSnapshot=null;truckRosterError='';state=makeState\(\[\]\)/);
});

test('test hostname can read the authenticated roster but cannot write production tasks or members',()=>{const fs=require('node:fs'),s=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');assert.match(s,/if\(previewOnly\(\)&&!\['GET','HEAD'\]\.includes\(method\)&&!\['session','oauth-session'\]\.includes\(endpoint\)\)/);assert.match(s,/function assertAdmin\(\)\{if\(previewDemoMode\|\|previewOnly\(\)\)/);});
