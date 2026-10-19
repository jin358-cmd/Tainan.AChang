const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('Owner UI request keeps assignment controls while removing the old add and delete controls',()=>{
  const html=read('index.html'),app=read('app.js');
  assert.doesNotMatch(html,/id="pickVolunteerBtn"/);
  assert.match(html,/class="pending-in-area"/);
  assert.doesNotMatch(html,/id="deletePerson"/);
  assert.match(app,/assigned&&hasPhone\(p\)/);
  assert.match(app,/data-area-choice="\$\{esc\(selectedArea\)\}"/);
});

test('Roster wording, action order and edit form match the approved labels',()=>{
  const app=read('app.js'),css=read('v04-restore.css');
  for(const label of ['原居住里：','已分派 ','指定服務里','個資編輯','分派服務里','✓ 確認儲存'])assert.ok(app.includes(label));
  assert.ok(app.indexOf('指定服務里')<app.indexOf('個資編輯'));
  assert.match(css,/\.roster-phone\{font-size:16px/);
  assert.match(css,/\.confirm-save\{color:#ffe45c/);
});

test('Device exports are village ordered, formula-safe and use the approved names',()=>{
  const app=read('app.js');
  for(const label of ['服務里人員分配','垃圾車跟巡拜訪'])assert.ok(app.includes(label));
  assert.match(app,/function areaRank\(area\)/);
  assert.match(app,/sort\(\(a,b\)=>areaRank/);
  assert.match(app,/\^\[=\+\\-@\]/);
  assert.match(app,/\\ufeff/);
});

test('Planner uses the service-area selector pattern, three vehicle buttons per row and purple village blocks',()=>{
  const html=read('index.html'),app=read('app.js'),css=read('v04-restore.css');
  for(const id of ['planAreaPrev','planAreaNav','planAreaNext','planAreaPageStatus'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/AREAS\.slice\(0,4\),AREAS\.slice\(4,8\),AREAS\.slice\(8,10\)/);
  assert.match(css,/\.route-buttons\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.visit-sequence \.stop-area\{background:#7252ba/);
});

test('Map volunteer marker follows the gray-black droplet/count/crown reference',()=>{
  const app=read('app.js'),css=read('v04-restore.css');
  assert.match(app,/function volunteerMapBadge\(count,hasLeader/);
  assert.match(app,/assignedPeople\.some\(p=>p\.is_leader\)/);
  assert.match(css,/\.map-badge\.volunteer\{[^}]*border-radius:50% 50% 50% 7px/);
  assert.match(css,/background:#34383d/);
  assert.match(css,/\.marker-crown/);
});

test('Planner hint and action layout use current selection and approved labels',()=>{
  const html=read('index.html'),app=read('app.js'),css=read('v04-restore.css');
  assert.match(html,/id="unassignedRouteHint"[^>]*hidden/);
  assert.match(app,/pendingAreas\(stops,tasks,d,selectedShift,truck\)/);
  assert.match(app,/pending\.join\(' · '\).*跟巡：尚未指派/);
  assert.doesNotMatch(app,/同一天同時段每位志工僅能安排一個跟巡小組或站點/);
  assert.doesNotMatch(app,/同日同時段每人只排一班/);
  assert.match(app,/>指派人員<\/button>/);
  assert.match(app,/class="task-status-select" data-task-status=/);
  assert.match(css,/\.stop-buttons \.assign-person\{margin-left:auto\}/);
  assert.match(css,/\.task-status-select\{order:-1;margin:0 auto 0 0/);
});
