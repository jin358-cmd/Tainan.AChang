'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');

function classify(nowIso,visitDate,status='待訪'){
 const start=app.indexOf("const taipeiToday=");const end=app.indexOf('function volunteerGroups()',start);assert.ok(start>=0&&end>start);
 const RealDate=Date;class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:[nowIso]))}static now(){return new RealDate(nowIso).getTime()}}
 const context={Date:FixedDate,Intl,result:null};vm.createContext(context);vm.runInContext(app.slice(start,end)+`;result=taskDateCategory(${JSON.stringify({visit_date:visitDate,status})})`,context);return context.result;
}

test('task dates use Asia/Taipei midnight and ignore completion status',()=>{
 assert.equal(classify('2026-10-28T15:59:59Z','2026-10-27','完成'),'history');
 assert.equal(classify('2026-10-28T15:59:59Z','2026-10-28','完成'),'current');
 assert.equal(classify('2026-10-28T15:59:59Z','2026-10-29','待訪'),'future');
 assert.equal(classify('2026-10-28T16:00:00Z','2026-10-28','待訪'),'history');
 assert.equal(classify('2026-10-28T16:00:00Z','2026-10-29','完成'),'current');
});

test('administrator task teams use one consistent two-row card with leader contact and route metadata',()=>{
 assert.match(app,/task-team-row task-team-primary/);assert.match(app,/task-team-identity/);assert.match(app,/task-leader-crown/);
 assert.match(app,/task-team-row task-team-route/);assert.match(app,/task-team-plate/);assert.match(app,/taskProgress\(done,entries\.length\)/);
 assert.match(styles,/#page-reports \.task-team\{background:#eaf5ff/);assert.match(styles,/\.task-team-phone\{font-size:18px/);
});

test('map popup enlarges member identity and centers the existing assignment button',()=>{
 assert.match(app,/class="popup-crown"/);assert.match(app,/class="popup-detail-btn" data-view-assignment/);
 assert.match(styles,/#page-map #areaPopup \.popup-contact strong\{font-size:20px/);
 assert.match(styles,/#page-map #areaPopup \.popup-detail-btn[\s\S]*margin:10px auto 0/);
});

test('mobile settings sheet is content-sized with the device card directly after exports',()=>{
 assert.match(styles,/\.modal-backdrop\.settings-open \.sheet\{[^}]*height:auto/);
 assert.match(styles,/\.sheet-body>\.pick-list\{[^}]*min-height:0/);
 assert.match(styles,/\.pick-row:last-child\{margin-top:0/);
 assert.doesNotMatch(styles,/\.modal-backdrop\.settings-open \.sheet\{[^}]*height:min\(700px/);
});

test('fourth task page exposes three requested groups without changing task APIs',()=>{
 assert.match(app,/history:'歷史跟巡',current:'當日跟巡',future:'下次跟巡'/);
 assert.match(app,/task-date-'\+category/);assert.match(app,/category==='current'\?'open':''/);
 assert.match(app,/volunteerTaskCategory==='current'/);assert.match(app,/taskDateCategory\(\{visit_date:day\}\)==='current'\?'open':''/);
 assert.match(app,/目前沒有'\+dateLabels\[category\]\+'資料/);
 assert.doesNotMatch(app,/function taskDateCategory[\s\S]{0,300}status/);
});
