const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('provisioning separates non-unique contact phone from Auth identity',()=>{
 const source=read('supabase/functions/achang-admin-provision/index.ts');
 assert.match(source,/volunteer-'\+memberId\+'@auth\.achang\.invalid/);
 assert.match(source,/loginId='ACH-'\+memberId/);
 assert.doesNotMatch(source,/createUser\(\{phone,password/);
 assert.match(source,/status:'pending'/);
});

test('PIN login resolves one account by independent login_id and enforces status',()=>{
 const source=read('supabase/functions/achang-pin-login/index.ts');
 assert.match(source,/\.eq\('login_id',loginId\)/);
 assert.match(source,/ACCOUNT_PENDING/);
 assert.match(source,/acct\.status!=='active'/);
 assert.doesNotMatch(source,/\.eq\('phone_e164'/);
});

test('volunteer application requires a one-time invitation and creates Pending',()=>{
 const source=read('supabase/functions/achang-member-apply/index.ts');
 assert.match(source,/application_code_hash/);
 assert.match(source,/application_code_expires_at/);
 assert.match(source,/status:'pending'/);
 assert.match(source,/achang_try_pin_attempt/);
 assert.doesNotMatch(source,/createUser\(\{phone,password/);
});

test('migration preserves revoked history and adds auditable soft delete',()=>{
 const sql=read('supabase/migrations/20261024050539_achang_auth_identity_pending_device_soft_delete.sql');
 assert.match(sql,/where status in \('pending', 'approved'\)/);
 assert.match(sql,/member_authorization_events/);
 assert.match(sql,/application_code_hash/);
 assert.match(sql,/deleted_at timestamptz/);
 assert.match(sql,/set status='suspended'/);
 assert.match(sql,/set status='revoked'/);
 assert.doesNotMatch(sql,/update public\.member_devices\s+set status='approved'/i);
});

test('application requests a new pending row when only revoked bindings exist',()=>{
 const server=read('lib/server.js');
 assert.match(server,/DEVICE_APPLICATION_REQUIRED/);
 assert.match(server,/found\?\.status==='pending'.*DEVICE_PENDING/);
 assert.match(server,/found\?\.status!=='pending'/);
 assert.match(server,/status:'pending',requested_at/);
 assert.doesNotMatch(server,/found\.status='approved'/);
});

test('second device requires explicit member confirmation before a pending request',()=>{
 const session=read('api/session.js'),application=read('api/device-application.js'),ui=read('app.js');
 assert.match(session,/device_application_required/);
 assert.match(session,/deviceCheck\(req,p,p\.token,false\)/);
 assert.match(application,/identitySession/);
 assert.match(application,/deviceCheck\(req,p,p\.token,true\)/);
 assert.match(ui,/此裝置尚未授權，是否提出申請/);
 assert.match(ui,/onlineApi\('device-application','POST'/);
});

test('reactivation keeps account and device authorization as separate states',()=>{
 const api=read('api/members.js'),migration=read('supabase/migrations/20261024050539_achang_auth_identity_pending_device_soft_delete.sql'),ui=read('app.js');
 assert.match(api,/action==='reactivate'/);
 assert.match(api,/只有曾核准後停用的會員可以恢復啟用/);
 assert.match(api,/會員名冊已封存/);
 assert.match(api,/只有待核准會員可以執行首次核准/);
 assert.match(api,/恢復帳號必須使用受控的重新啟用流程/);
 assert.doesNotMatch(api,/if\(status==='suspended'\).*member_devices/);
 assert.match(migration,/account_reactivated/);
 assert.match(ui,/已停用會員/);
 assert.match(ui,/data-account-reactivate/);
});
