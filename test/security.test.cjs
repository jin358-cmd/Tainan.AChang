process.env.SUPABASE_URL='https://fhxdpupascsikjsycpbi.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_only';
process.env.EXPECTED_SUPABASE_PROJECT_REF='fhxdpupascsikjsycpbi';
process.env.VERCEL_ENV='preview';
const t=require('node:test'),assert=require('node:assert/strict');const L=require('../lib/server');
t('拒絕任意電話格式',()=>{assert.equal(L.phone('0989-098-468'),'+886989098468');assert.throws(()=>L.phone('1234567890'),/手機號碼/)});
t('日期、時間格式有驗證',()=>{assert.equal(L.validDate('2026-10-19'),'2026-10-19');assert.throws(()=>L.validDate('tomorrow'));assert.throws(()=>L.time('25:00'))});
t('公鑰可公開但絕不包含 Service Role 密鑰',()=>{assert.match(L.KEY,/^sb_publishable_/);assert.ok(!('SUPABASE_SERVICE_ROLE_KEY' in L))});
t('Preview backend project ref must match and can never be production',()=>{
 assert.equal(L.backendConfig().projectRef,'fhxdpupascsikjsycpbi');
 assert.throws(()=>L.backendConfig({SUPABASE_URL:'https://ctskglmglevronvnkpmm.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example',EXPECTED_SUPABASE_PROJECT_REF:'ctskglmglevronvnkpmm',VERCEL_ENV:'preview'}),/Preview/);
 assert.throws(()=>L.backendConfig({SUPABASE_URL:'https://fhxdpupascsikjsycpbi.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example',EXPECTED_SUPABASE_PROJECT_REF:'wrongref',VERCEL_ENV:'preview'}),/不完整或不一致/);
});
t('檢查來路不明的跨網站寫入',()=>{assert.throws(()=>L.originCheck({method:'POST',headers:{origin:'https://evil.invalid',host:'sample.vercel.app'}}),/拒絕跨網站/);assert.doesNotThrow(()=>L.originCheck({method:'POST',headers:{origin:'https://sample.vercel.app',host:'sample.vercel.app'}}))});
t('任意 token 不能通過 bootstrap 機密比對',()=>{assert.equal(L.safeEqual('bad','correct-secret'),false);assert.equal(L.safeEqual('same','same'),true)});
t('ID 只接受 UUID',()=>{assert.throws(()=>L.uuid('DEMO-01'));assert.equal(L.uuid('92acbbaf-7e99-4a26-92ab-98297eb5076d'),'92acbbaf-7e99-4a26-92ab-98297eb5076d')});
t('grant migration schema absence is detected for safe fallback',()=>{
 assert.equal(L.missingGrantSchema({ok:false,data:{code:'42703',message:'column can_edit_profile does not exist'}}),true);
 assert.equal(L.missingGrantSchema({ok:false,data:{message:'Could not find the can_edit_profile column'}}),true);
 assert.equal(L.missingGrantSchema({ok:false,data:{code:'42501',message:'permission denied'}}),false);
 assert.equal(L.missingGrantSchema({ok:true,data:[]}),false);
});
const fs=require('node:fs'),path=require('node:path');
t('管理員電子郵件登入並保留志工手機登入路徑',()=>{const v=fs.readFileSync(path.join(__dirname,'../api/session.js'),'utf8');assert.match(v,/identity\.includes\('@'\)/);assert.match(v,/email:identity\.toLowerCase\(\)/);assert.match(v,/phone:L\.phone\(identity\)/)});
t('管理員內部紀錄不進入志工名冊',()=>{const v=fs.readFileSync(path.join(__dirname,'../api/roster.js'),'utf8');assert.match(v,/filter\(x=>!L\.internalMember\(x\)\)/)});
t('管理員內部身分不能被當作志工修改、開通或排班',()=>{
 assert.equal(L.internalMember({source_member_id:'ADMIN-PRIMARY-TEST'}),true);
 assert.equal(L.internalMember({source_member_id:'V-TEST-001'}),false);
 for(const file of ['api/roster.js','api/members.js','api/tasks.js'])assert.match(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),/L\.internalMember\(/);
});
t('個人資料預設唯讀且 grant 不能由志工或離線快取自行取得',()=>{
 const migration=fs.readFileSync(path.join(__dirname,'../backend/004_profile_edit_grants.sql'),'utf8');
 const profile=fs.readFileSync(path.join(__dirname,'../api/profile.js'),'utf8');
 const access=fs.readFileSync(path.join(__dirname,'../api/roster-access.js'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.match(migration,/can_edit_profile boolean not null default false/i);
 assert.match(profile,/authorized\(req,res,\['volunteer'\]\)/);
 assert.match(profile,/if\(!p\.can_edit_profile\)L\.problem\(403/);
 assert.match(profile,/rpc\/update_own_profile/);
 assert.match(access,/authorized\(req,res,\['admin'\]\)/);
 assert.match(access,/role=eq\.volunteer/);
 assert.match(access,/featureReady/);
 assert.match(access,/L\.problem\(503,'人員編輯授權後端尚待 Owner 核准 migration'\)/);
 assert.match(access,/account\.status!=='active'\|\|!member\.phone_e164/);
 assert.match(app,/offlineMode=true;role='volunteer'.*canEditProfile=false/);
 assert.match(app,/migration 尚待 Owner 核准/);
 assert.match(app,/filter\(x=>x\.accountId\)/);
});
t('窄 RPC 只允許本人非身分欄位，不能改電話或 source id',()=>{
 const migration=fs.readFileSync(path.join(__dirname,'../backend/004_profile_edit_grants.sql'),'utf8');
 assert.match(migration,/security definer/i);
 assert.match(migration,/ma\.auth_user_id = auth\.uid\(\)/);
 assert.match(migration,/ma\.role = 'volunteer'/);
 assert.match(migration,/ma\.can_edit_profile = true/);
 assert.match(migration,/m\.source_member_id not like 'ADMIN-%'/);
 const updateBlock=migration.slice(migration.indexOf('update public.members'));
 assert.doesNotMatch(updateBlock,/phone_e164\s*=/i);
 assert.doesNotMatch(updateBlock,/source_member_id\s*=/i);
});
