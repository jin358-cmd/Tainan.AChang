'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

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
 assert.match(styles,/@media\(max-width:530px\)[\s\S]*#page-reports \.task-route-separator\{display:inline\}/);
 assert.match(styles,/@media\(max-width:530px\)[\s\S]*#page-reports \.task-team-shift \.legend-pin\{display:grid;width:18px;height:18px;font-size:11px\}/);
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
 assert.match(styles,/\.restored-map-popup\[hidden\]\{display:none!important\}/);
 assert.match(styles,/\.restored-map-popup\[hidden\]\{display:none!important\}/);
 assert.match(styles,/@media\(min-width:621px\)[\s\S]*\.restored-map-popup\{[^}]*width:min\(430px,calc\(100% - 20px\)\)!important[^}]*max-width:none!important[^}]*overflow:hidden!important/);
 assert.match(styles,/@media\(min-width:621px\)[\s\S]*\.popup-contact strong\{[^}]*white-space:nowrap/);
 assert.match(styles,/@media\(min-width:621px\)[\s\S]*\.popup-crown\{position:relative;top:-2px\}/);
 assert.match(app,/const pw=Math\.min\(430,Math\.max\(210,box\.clientWidth-20\)\)/);
 assert.match(app,/document\.addEventListener\('click',e=>\{const close=e\.target\.closest\?\.\('\[data-close-area\]'\)[\s\S]*e\.stopPropagation\(\);p\.hidden=true;\},true\)/);
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

test('roster status filter uses the requested order and starts at pending without resetting later refreshes',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const select=html.match(/<select id="peopleFilter"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
 assert.match(select,/^<option value="pending">待分配<\/option><option value="assigned">已分配<\/option><option value="leader">組長<\/option><option value="all">全部人員<\/option>$/);
 assert.match(app,/\$\('#peopleFilter'\)\.value='pending';bind\(\)/);
 assert.equal((app.match(/\$\('#peopleFilter'\)\.value='pending'/g)||[]).length,1);
});

test('member authorization cards distinguish administrators without changing account status controls',()=>{
 assert.match(app,/approved-member-row \$\{m\.role==='admin'\?'admin-member-row':'volunteer-member-row'\}/);
 assert.match(styles,/\.approved-member-row\.admin-member-row\{background:#f3edff;border-color:#c9b9ec\}/);
 assert.match(app,/m\.status==='suspended'\?'已停用':'待核准'/);
});

test('new-member form leaves service-area assignment for the existing allocation workflow',()=>{
 const start=app.indexOf('function openNewMemberForm()'),end=app.indexOf('async function submitNewMemberForm',start),form=app.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.doesNotMatch(form,/分派服務里|name="assignment"/);
 assert.match(app,/onlineApi\('roster','POST',\{name:b\.name,phone:b\.phone,address:b\.address,residentArea:b\.residentArea,assignment:null\}\)/);
});

test('fourth task page exposes three requested groups without changing task APIs',()=>{
 assert.match(app,/history:'歷史跟巡',current:'當日跟巡',future:'下次跟巡'/);
 assert.match(app,/task-date-'\+category/);assert.match(app,/category==='current'\?'open':''/);
 assert.match(app,/volunteerTaskCategory==='current'/);assert.match(app,/taskDateCategory\(\{visit_date:day\}\)==='current'\?'open':''/);
 assert.match(app,/目前沒有'\+dateLabels\[category\]\+'資料/);
 assert.doesNotMatch(app,/function taskDateCategory[\s\S]{0,300}status/);
 assert.doesNotMatch(app,/單日進度示範|示範小組：3 項排班任務|task-sample/);
});

test('desktop task categories stack history and future at left while mobile keeps DOM order',()=>{
 assert.match(app,/root\.classList\.remove\('task-date-layout'\)/);
 assert.match(app,/root\.classList\.toggle\('task-date-layout',days\.length>0\)/);
 assert.match(app,/task-date-left-stack[^\n]*categoryHtml\('history'\)\+categoryHtml\('future'\)[^\n]*categoryHtml\('current'\)/);
 assert.match(styles,/\.task-date-left-stack\{display:contents\}/);
 assert.match(styles,/\.task-date-history\{order:1\}\.task-date-current\{order:2\}\.task-date-future\{order:3\}/);
 assert.match(styles,/@media\(min-width:800px\)\{[\s\S]*#page-reports #reportsContent\.task-date-layout\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)[^}]*align-items:stretch/);
 assert.match(styles,/\.task-date-left-stack\{display:flex;flex-direction:column;gap:8px/);
 assert.match(styles,/\.task-date-left-stack>\.task-date-category:not\(\[open\]\)\{flex:1 1 0\}/);
 assert.match(styles,/\.task-date-current\{align-self:start\}/);
 assert.doesNotMatch(styles,/\.task-date-(?:history|future)\{[^}]*(?:position:absolute|transform:translate)/);
});

test('desktop navigation reuses the five mobile icons without changing labels',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const desktop=html.match(/<nav class="desktop-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.match(desktop,/data-page="map"><i[^>]*>◉<\/i><span>地圖<\/span>/);
 assert.match(desktop,/data-page="areas"><i[^>]*>⌖<\/i><span>服務分區<\/span>/);
 assert.match(desktop,/data-page="planner"><i[^>]*>🚛<\/i><span>跟巡排班<\/span>/);
 assert.match(desktop,/data-page="reports"><i[^>]*>✓<\/i><span>任務<\/span>/);
 assert.match(desktop,/data-page="people"><i[^>]*>☷<\/i><span>名冊<\/span>/);
 assert.doesNotMatch(desktop,/[①②③④⑤]/);
});

test('service-area assignment picker enlarges only desktop village and action text',()=>{
 assert.match(app,/pick-list person-area-picker/);assert.match(app,/pick-row person-area-row/);assert.match(app,/person-area-assign/);
 assert.match(styles,/@media\(min-width:800px\)\{[^}]*\.desktop-nav button[\s\S]*\.person-area-picker \.person-area-row>strong\{font-size:18px\}[\s\S]*\.person-area-picker \.person-area-assign\{font-size:17px/);
 assert.doesNotMatch(styles,/@media\(max-width:[^)]+\)[^{]*\{[^}]*person-area-(?:row|assign)/);
});

test('desktop service-area counts match and village tiles show people units without changing mobile',()=>{
 assert.match(styles,/\.pending-desktop-label\{display:none\}@media\(min-width:800px\)\{#page-areas #areaAssignedCount,#page-areas #pendingCount\{font-size:14px;font-weight:850;line-height:1\.3\}\.pending-mobile-label\{display:none\}\.pending-desktop-label\{display:inline\}\.area-pager \.area-pill em::after\{content:'人'\}#areaMembers \.member,#pendingMembers \.member\{min-height:60px\}#page-areas #pendingMembers \.member\.pending\{background:#edf4f8;border-color:#c7d8e4\}#pendingMembers \.member\.pending \.member-info\{display:flex;align-items:center;gap:8px\}/);
 assert.match(styles,/#pendingMembers \.member\.pending \.service-phone,#pendingMembers \.member\.pending \[data-assign\]\{box-sizing:border-box;min-height:38px;padding:8px 9px;font-size:14px!important;line-height:1\.2;white-space:nowrap\}/);
 assert.match(html,/<span class="pending-mobile-label">待分配人員 <\/span><span id="pendingCount" class="count-tag warm"><span class="pending-desktop-label">待分配 <\/span><span id="pendingCountValue">0<\/span> 人<\/span>/);
 assert.doesNotMatch(styles,/@media\(max-width:[^)]+\)[^{]*\{[^}]*area-pill em::after/);
});

test('desktop create and edit member forms share readable field labels and controls',()=>{
 assert.match(styles,/@media\(min-width:800px\)\{#newMemberForm>label,#personForm>label\{font-size:15px;line-height:1\.4\}#newMemberForm>label>input,#newMemberForm>label>select,#personForm>label>input,#personForm>label>select\{min-height:48px;padding:10px 12px;font-size:16px;line-height:1\.35\}\}/);
 assert.doesNotMatch(styles,/@media\(max-width:[^)]+\)[^{]*\{[^}]*(?:#newMemberForm|#personForm)/);
});
