const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('provisioning separates non-unique contact phone from Auth identity',()=>{
 const source=read('supabase/functions/achang-admin-provision/index.ts');
 assert.match(source,/role==='admin'\?'admin-':'volunteer-'/);
 assert.match(source,/loginId='ACH-'\+memberId/);
 assert.doesNotMatch(source,/createUser\(\{phone,password/);
 assert.match(source,/status:'active'/);
 assert.match(source,/device_approval_required:true/);
 assert.match(source,/approved_by:user\.id/);
});

test('phone plus PIN resolves a unique account without treating phone as Auth identity',()=>{
 const source=read('supabase/functions/achang-pin-login/index.ts');
 assert.match(source,/\.eq\('phone_e164',phone\)/);
 assert.match(source,/authenticateAccountCandidates/);
 assert.match(source,/auth\.admin\.getUserById/);
 assert.match(source,/ACCOUNT_PENDING/);
 assert.match(source,/decision\.kind==='blocked'/);
 assert.doesNotMatch(source,/createUser\(\{phone/);
});

test('shared phone identity choices are encrypted, masked and short lived',()=>{
 const source=read('supabase/functions/achang-pin-login/index.ts'),session=read('api/session.js'),ui=read('app.js');
 assert.match(source,/AES-GCM/);
 assert.match(source,/sealSelection/);
 assert.match(source,/expiresAt:Date\.now\(\)\+120\*1000/);
 assert.match(source,/maskName/);
 assert.match(source,/IDENTITY_SELECTION_REQUIRED/);
 assert.match(source,/v4-selection-context/);
 assert.match(source,/v4-selection-nonce/);
 assert.match(source,/authenticateAccountCandidates/);
 assert.match(source,/admin\.auth\.admin\.signOut\(session\.access_token,'local'\)/);
 assert.match(source,/if\(decision\.kind==='error'\)return reply\(\{error:'Authentication service unavailable'\},503\)/);
 assert.ok(source.indexOf('signInWithPassword')<source.indexOf("return reply({code:'IDENTITY_SELECTION_REQUIRED'"),'PIN must be verified before identities are returned');
 assert.match(session,/identity_selection_required/);
 assert.match(ui,/loginAttemptSerial/);
 assert.match(ui,/new FormData\(form\).*setLoginFormLocked\(form,true\)/);
 assert.match(ui,/登入暫存已清除/);
 assert.match(ui,/if\(loginInFlight\)return;loginAttemptSerial\+\+/);
 assert.match(ui,/finally\{if\(serial===loginAttemptSerial\)\{loginInFlight=false;setLoginFormLocked\(form,false\)\}\}/);
});

test('TEST preview hosts still restore an authenticated server session on boot',()=>{
 const ui=read('app.js');
 assert.match(ui,/if\(!googleHandled\)await authStart\(\);if\(previewOnly\(\)\)previewLoginButton\(\)/);
 assert.doesNotMatch(ui,/if\(!googleHandled&&!previewOnly\(\)\)await authStart\(\)/);
});

test('volunteer application requires a one-time invitation and creates Pending',()=>{
 const source=read('supabase/functions/achang-member-apply/index.ts'),claim=read('supabase/migrations/20261025070000_achang_atomic_invitation_claim.sql');
 assert.match(claim,/application_code_hash/);
 assert.match(claim,/application_code_expires_at/);
 assert.match(source,/status:'pending'/);
 assert.match(source,/achang_try_pin_attempt/);
 assert.doesNotMatch(source,/createUser\(\{phone,password/);
});

test('member application confirms and clears the six-digit PIN',()=>{
 const ui=read('app.js');
 assert.match(ui,/name="confirmPin"/);
 assert.match(ui,/d\.pin!==d\.confirmPin/);
 assert.match(ui,/delete d\.confirmPin/);
 assert.match(ui,/form\.elements\.pin\.value=''/);
 assert.match(ui,/form\.elements\.confirmPin\.value=''/);
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
 const session=read('api/session.js'),application=read('api/device-application.js'),ui=read('app.js'),server=read('lib/server.js');
 assert.match(session,/device_application_required/);
 assert.match(session,/deviceCheck\(req,p,p\.token,false\)/);
 assert.match(application,/identitySession/);
 assert.match(application,/deviceCheck\(req,p,p\.token,true\)/);
 assert.match(application,/\['admin','volunteer'\]\.includes\(p\.role\)/);
 assert.doesNotMatch(application,/p\.role!=='volunteer'/);
 assert.match(session,/await L\.revokeLocalSession\(req,res\);L\.clearCookies\(res\)/);
 assert.match(server,/scope=local/);
 assert.match(server,/setSession\(res,refreshed\.data\)/);
 assert.doesNotMatch(server,/scope=global/);
 assert.doesNotMatch(ui,/onlineApi\('session','DELETE'\)\.catch/);
 assert.match(ui,/登出未完成/);
 assert.match(ui,/此裝置尚未授權，是否提出申請/);
 assert.match(ui,/onlineApi\('device-application','POST'/);
});

test('a required-device admin with only a pending device cannot approve it',()=>{
 const members=read('api/members.js'),server=read('lib/server.js');
 assert.match(members,/authorized\(req,res,\['admin'\]\)/);
 assert.match(server,/async function authorized\(req,res,roles\)\{const p=await session\(req,res\)/);
 assert.match(server,/async function session\(req,res\)\{const p=await identitySession\(req,res\);await deviceCheck\(req,p,p\.token\)/);
 assert.match(server,/if\(found\?\.status==='pending'\)problem\(403,[^\n]+,'DEVICE_PENDING'\)/);
 assert.match(server,/account\.role==='admin'&&account\.device_approval_required===false&&!requestApproval/);
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

test('four-digit invitation has conditional claim and global phone rate limit',()=>{
 const issue=read('api/members.js'), apply=read('supabase/functions/achang-member-apply/index.ts'),claim=read('supabase/migrations/20261025070000_achang_atomic_invitation_claim.sql');
 assert.match(issue,/crypto\.randomInt\(0,10000\)/);
 assert.match(issue,/padStart\(4,'0'\)/);
 assert.match(apply,/\^\[0-9\]\{4\}\$/);
 assert.match(apply,/application-phone-24h/);
 assert.match(apply,/p_window_seconds:86400/);
 assert.match(issue,/attempt<8/);
 assert.match(issue,/application_code_hash===mem\.application_code_hash/);
 assert.match(apply,/achang_claim_member_invitation/);
 assert.match(claim,/m\.phone_e164 = p_phone/);
 assert.match(claim,/m\.deleted_at is null/);
 assert.match(claim,/m\.application_code_expires_at > statement_timestamp\(\)/);
 assert.match(claim,/not exists \(\s*select 1 from public\.member_accounts/);
 assert.match(claim,/invite_consumed/);
 assert.match(claim,/revoke all on function public\.achang_claim_member_invitation\(text,text,text\)/);
 assert.match(claim,/to service_role/);
 assert.match(claim,/cannot disable the final usable administrator/);
 assert.match(claim,/d\.status = 'approved'/);
 assert.match(claim,/prevent_last_usable_admin_device_revoke/);
 assert.match(claim,/cannot revoke the final usable administrator device/);
 assert.match(claim,/d\.id <> old\.id/);
 assert.match(claim,/pg_advisory_xact_lock\(hashtext\('achang-active-admin-guard'\)\)/);
});

test('administrator controls use a protected PIN form and keep a final-admin guard',()=>{
 const ui=read('app.js'),api=read('api/members.js'),edge=read('supabase/functions/achang-admin-provision/index.ts');
 assert.match(ui,/id="directProvisionForm"/);
 assert.match(ui,/id="directAdminBtn"/);
 assert.doesNotMatch(ui,/prompt\('請讓志工本人當面設定六碼 PIN/);
 assert.match(api,/\['volunteer','admin'\]\.includes\(role\)/);
 assert.match(api,/'X-AChang-Device':deviceId/);
 assert.doesNotMatch(edge,/device_approval_required!==false/);
 assert.match(edge,/intentionally unconditional/);
 assert.match(edge,/\.eq\('account_id',admin\.id\)/);
 assert.match(edge,/\.eq\('device_id_hash',deviceHash\)/);
 assert.match(edge,/\.eq\('status','approved'\)/);
 assert.match(edge,/Administrator audit failed/);
 assert.match(edge,/member_accounts'\)\.delete\(\)/);
 assert.match(api,/await L\.deviceCheck\(req,p,p\.token,true\)/);
});

test('device approval is conditional so a late approval cannot revive a revoke',()=>{
 const api=read('api/members.js');
 assert.match(api,/b\.approved\?'&status=eq\.pending':'&status=neq\.revoked'/);
 assert.match(api,/if\(!updated\)L\.problem\(409/);
});
