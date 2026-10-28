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
 assert.match(app,/task-route-separator[^>]*aria-hidden="true">・/);assert.match(app,/task-team-shift/);assert.match(app,/shiftIcon=shift==='日間'\?'☀':'☾'/);
 assert.match(styles,/#page-reports \.task-team\{background:#eaf5ff/);assert.match(styles,/\.task-team-phone\{font-size:18px/);
 assert.match(styles,/#page-reports \.task-team-primary\{[^}]*flex-direction:row/);
 assert.match(styles,/#page-reports \.task-team-primary \.task-progress-status\{[^}]*font-size:13px[^}]*min-width:112px[^}]*min-height:34px/);
 assert.match(styles,/#page-reports \.task-team-primary \.task-progress-label\{padding:3px 6px\}/);
 assert.match(styles,/@media\(min-width:531px\)\{#page-reports \.task-team-primary \.task-progress-status\{font-size:15px\}\}/);
 assert.match(styles,/#page-reports \.task-member-list\{background:#fff0f5/);
 assert.match(styles,/#page-reports \.task-member-progress\{flex-wrap:nowrap;align-items:center;gap:8px\}/);
 assert.match(styles,/#page-reports \.task-member-progress>\.task-progress-status\{[^}]*margin-left:auto[^}]*min-width:100px[^}]*text-align:center/);
 assert.match(styles,/#page-reports \.task-date-history \.task-team\{background:#fff7dc;border-color:#e6cf7a\}/);
 assert.match(styles,/#page-reports \.task-route-separator,#page-reports \.task-team-shift \.legend-pin\{display:none\}/);
});

test('map popup enlarges member identity and centers the existing assignment button',()=>{
 assert.match(app,/class="popup-crown"/);assert.match(app,/class="popup-detail-btn" data-view-assignment/);
 assert.match(app,/esc\(p\.name\)\+\(leader\?' <span class="popup-crown"/);
 assert.doesNotMatch(app,/popup-eyebrow">已選取里別/);
 assert.match(styles,/#page-map #areaPopup \.popup-contact strong\{font-size:20px/);
 assert.match(styles,/#page-map #areaPopup \.popup-detail-btn[\s\S]*margin:10px auto 0/);
 assert.match(app,/matchMedia\?\.\('\(max-width:620px\)'\)[\s\S]*translate\(-50%,-50%\)/);
 assert.match(styles,/\.restored-map-popup\{[^}]*height:min\(380px,calc\(100% - 20px\)\)!important[^}]*overflow:hidden!important/);
 assert.match(styles,/\.popup-contacts\{flex:1 1 auto;min-height:0;max-height:242px!important;overflow-y:auto!important/);
});

test('mobile settings sheet is content-sized with the device card directly after exports',()=>{
 assert.match(styles,/\.modal-backdrop\.settings-open \.sheet\{[^}]*height:auto/);
 assert.match(styles,/\.sheet-body>\.pick-list\{[^}]*min-height:0/);
 assert.match(styles,/\.pick-row:last-child\{margin-top:0/);
 assert.doesNotMatch(styles,/\.modal-backdrop\.settings-open \.sheet\{[^}]*height:min\(700px/);
});

test('settings install callout enlarges only its heading and keeps a compact touch-safe action',()=>{
 assert.match(styles,/\.settings-open \.install-tip>strong\{font-size:19px/);
 assert.match(styles,/\.settings-open \.install-tip \.install-app-large\{[^}]*width:auto[^}]*min-height:44px[^}]*font-size:14px/);
 assert.doesNotMatch(styles,/\.settings-open \.pick-row button\{[^}]*font-size:14px/);
});

test('service-area leader and remove controls match phone sizing without forced equal widths',()=>{
 assert.match(styles,/#areaMembers \.member-actions\{[^}]*flex-wrap:nowrap/);
 assert.match(styles,/#areaMembers \.member-actions \.service-phone,#areaMembers \.member-actions button\[data-leader\],#areaMembers \.member-actions button\[data-remove\]\{[^}]*width:auto[^}]*min-height:38px[^}]*font-size:14px!important/);
 assert.doesNotMatch(styles,/#areaMembers \.member-actions[^}]*grid-template-columns/);
});

test('planner removes the redundant current-area summary without changing scheduling controls',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 assert.doesNotMatch(html,/id="plannerFocus"/);assert.doesNotMatch(app,/\$\('#plannerFocus'\)|\$\('#plannerRouteInline'\)/);
 for(const id of ['planDate','plannerAreaSelect','routeButtons','areaTeamPicker','stopList'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/data-shift="日間"/);assert.match(html,/data-shift="夜間"/);assert.match(app,/renderStops\(rows\)/);
});

test('planner empty route hint spans the full available row without tiny or clipped text',()=>{
 assert.match(styles,/#page-planner #routeButtons>\.mini-note\{[^}]*grid-column:1\/-1[^}]*flex:1 1 100%[^}]*width:100%[^}]*font-size:13px[^}]*white-space:normal/);
 assert.doesNotMatch(styles,/#page-planner #routeButtons>\.mini-note\{[^}]*(?:text-overflow:ellipsis|overflow:hidden)/);
});

test('fourth task page exposes three requested groups without changing task APIs',()=>{
 assert.match(app,/history:'歷史跟巡',current:'當日跟巡',future:'下次跟巡'/);
 assert.match(app,/task-date-'\+category/);assert.match(app,/category==='current'\?'open':''/);
 assert.match(app,/volunteerTaskCategory==='current'/);assert.match(app,/taskDateCategory\(\{visit_date:day\}\)==='current'\?'open':''/);
 assert.match(app,/目前沒有'\+dateLabels\[category\]\+'資料/);
 assert.doesNotMatch(app,/function taskDateCategory[\s\S]{0,300}status/);
 assert.doesNotMatch(app,/單日進度示範|示範小組：3 項排班任務|task-sample/);
});
