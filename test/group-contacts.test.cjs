'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const edge=fs.readFileSync(path.join(root,'supabase/functions/achang-group-contacts/index.ts'),'utf8');
const tasks=fs.readFileSync(path.join(root,'api/tasks.js'),'utf8');

test('group contacts derive every boundary from the authenticated volunteer',()=>{
 assert.match(edge,/admin\.auth\.getUser\(token\)/);
 assert.match(edge,/role!=='volunteer'\|\|account\.status!=='active'/);
 assert.match(edge,/member_devices[\s\S]*device_id_hash[\s\S]*status','approved'/);
 assert.match(edge,/\.eq\('member_id',account\.member_id\)\.is\('cancelled_at',null\)/);
 assert.match(edge,/\[row\.service_date,row\.shift,row\.village,row\.truck_number\|\|''\]/);
 assert.doesNotMatch(edge,/await req\.json\(/);
});

test('group contacts return only the approved name and phone projection',()=>{
 assert.match(edge,/select\('id,display_name,phone_e164'\)/);
 assert.match(edge,/select\('member_id'\)[\s\S]*\.eq\('role','volunteer'\)\.eq\('status','active'\)/);
 assert.match(edge,/contacts\.push\(\{visit_date:[\s\S]*name:member\.display_name,phone:member\.phone_e164\|\|''\}\)/);
 assert.doesNotMatch(edge,/address|resident_area|assignment_note|notes/);
});

test('tasks API preserves session and device authorization and forwards no group selector',()=>{
 assert.match(tasks,/L\.authorized\(req,res,\['admin','volunteer'\]\)/);
 assert.match(tasks,/achang-group-contacts/);
 assert.match(tasks,/'x-achang-device':String\(req\.headers\['x-achang-device'\]\|\|''\)/);
 assert.match(tasks,/method:'POST',token:p\.token/);
 assert.doesNotMatch(tasks,/groupId|memberId.*achang-group-contacts|service-role/i);
});
