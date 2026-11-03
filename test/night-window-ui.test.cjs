'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const official=require('../official-routes.js'),adapter=require('../route-time-filter.js');
function harness(){
 const nodes=Object.fromEntries(['visitStartTime','visitEndTime','visitTimeHint'].map(id=>[id,{}]));
 const source=app.slice(app.indexOf('function visitPreferenceSubject()'),app.indexOf('function applyDayRoutes()'));
 const storage=new Map(),c=vm.createContext({VISIT_TIME_PREF_KEY:'achang-visit-time-preferences-v1',window:{AChangRouteTime:adapter},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},$:s=>nodes[s.slice(1)],esc:String,shift:'夜間',dayRouteCategory:'six',date:'2026-11-03',chosenRoute:'',liveRole:'admin',liveMemberId:'',liveAccountId:'synthetic',visitTimeStart:'',visitTimeEnd:'',visitTimeCustomized:false,visitTimeLoadedKey:''});
 vm.runInContext(source,c);return {c,nodes,storage};
}
test('all 24 night vehicles default to the requested endpoints and filter actual source rows inclusively',()=>{
 const rows=official.normalize(require('../data-official-night-20261030.source.json'),'夜間'),routes=[...new Set(rows.map(r=>r['路線ID']))],{c,nodes}=harness();assert.equal(routes.length,24);
 for(const route of routes){c.chosenRoute=route;const rr=rows.filter(r=>r['路線ID']===route);c.renderVisitTimeFilter(rr);assert.equal(nodes.visitStartTime.value,'16:30',route);assert.equal(nodes.visitEndTime.value,'18:30',route);assert.match(nodes.visitStartTime.innerHTML,/value="16:30"/);assert.match(nodes.visitEndTime.innerHTML,/value="18:30"/);assert.equal(nodes.visitStartTime.disabled,false);assert.deepEqual(adapter.filter(rr,c.visitTimeStart,c.visitTimeEnd),rr.filter(r=>!adapter.struck(r)&&adapter.legalTime(r['到達'])&&r['到達']>='16:30'&&r['到達']<='18:30'));}
});
test('old night memories cannot mask new defaults; new manual choices persist without touching day preferences',()=>{
 const {c,nodes,storage}=harness();c.chosenRoute='night1';const subject=c.visitPreferenceSubject();storage.set('achang-visit-time-preferences-v1',JSON.stringify({version:1,subjects:{[subject]:{'夜間|night|all-dates|night1':{start:'19:00',end:'20:30'},'日間|six|all-dates|day1':{start:'06:30',end:'07:00'}}}}));
 const rows=[{'到達':'16:30'},{'到達':'17:00'},{'到達':'18:30'},{'到達':'19:00'}];c.renderVisitTimeFilter(rows);assert.equal(nodes.visitStartTime.value,'16:30');assert.equal(nodes.visitEndTime.value,'18:30');c.visitTimeCustomized=true;c.visitTimeStart='17:00';c.visitTimeEnd='18:30';c.rememberVisitTimePreference();c.resetVisitTime();c.renderVisitTimeFilter(rows);assert.equal(nodes.visitStartTime.value,'17:00');const saved=JSON.parse(storage.get('achang-visit-time-preferences-v1'));assert.equal(saved.subjects[subject]['日間|six|all-dates|day1'].start,'06:30');
});
test('desktop and mobile nav swap dispatch and planning and route entry contains list and search',()=>{
 for(const id of ['desktopNav','手機功能列']){const nav=id==='desktopNav'?html.match(/<nav[^>]*id="desktopNav"[\s\S]*?<\/nav>/)[0]:html.match(/<nav[^>]*aria-label="手機功能列"[\s\S]*?<\/nav>/)[0];assert.ok(nav.indexOf('data-page="reports"')<nav.indexOf('data-page="planner"'));assert.match(nav,/data-page="trucks"[^]*?查看完整路線/);}
 const page=html.slice(html.indexOf('<section id="page-trucks"'),html.indexOf('</main>'));assert.match(page,/aria-label="查看完整路線"/);assert.match(page,/id="directory"[^]*?id="search"/);assert.match(page,/>☀️ 日間<\/option>/);assert.match(page,/>🌙 夜間<\/option>/);
});
