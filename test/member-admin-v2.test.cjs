const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const corePromise=import(pathToFileURL(path.join(root,'supabase/functions/_shared/member-admin-v2-core.mjs')));

function fixture(overrides={}){
 const calls=[],account={id:'11111111-1111-4111-8111-111111111111',member_id:'22222222-2222-4222-8222-222222222222',auth_user_id:'33333333-3333-4333-8333-333333333333',role:'volunteer',status:'pending',approved_at:null};
 const deps={
  calls,now:()=> '2026-10-28T07:00:00.000Z',authAlias:async()=> '55555555555545558555555555555555',publicAccount:a=>({...a}),
  authenticate:async token=>token==='valid-admin'?{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'admin@example.invalid'}:null,
  getActiveAdmin:async id=>id==='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'?{id:'admin-account',role:'admin',status:'active'}:null,
  rateLimit:async(id,action)=>calls.push(['rate',id,action]),
  getMember:async id=>({id,phone_e164:'+886900000001',display_name:'合成會員',deleted_at:null}),
  getAccountByMember:async()=>null,getAccountById:async()=>account,
  isMemberArchived:async()=>false,
  ensureAuthUser:async payload=>{calls.push(['ensureAuth',payload]);return {id:'44444444-4444-4444-8444-444444444444'}},
  insertAccount:async values=>{calls.push(['insert',values]);return {...account,...values,id:account.id}},
  transitionAccountAtomic:async(id,action,status,reason)=>{calls.push(['transition',id,action,status,reason]);return {...account,status:action==='suspend'?'suspended':'active'}},
  archiveMemberAtomic:async(id,status,reason)=>{calls.push(['archive',id,status,reason]);return {...account,status:'suspended',deleted_at:'2026-10-28T07:01:00.000Z'}},
  promoteAdminAtomic:async(id,expectedRole,expectedStatus)=>{calls.push(['promote',id,expectedRole,expectedStatus]);return {...account,role:'admin',status:'active',approved_at:'2026-10-01T00:00:00Z',device_approval_required:false}},
  isProtectedPrincipal:async()=>false,
  listState:async()=>({ok:true,members:[],devices:[]})
 };
 return {account,deps:Object.assign(deps,overrides),calls};
}

test('TEST-01 valid active admin session can query member status',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps}=fixture();
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'list'}},deps);
 assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true,members:[],devices:[]});
});

test('TEST-03 volunteer/non-admin session is forbidden',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps}=fixture({authenticate:async()=>({id:'volunteer'}),getActiveAdmin:async()=>null});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-volunteer',body:{action:'list'}},deps),error=>error.status===403&&error.code==='ADMIN_REQUIRED');
});

test('TEST-04 missing or invalid session is unauthorized',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps}=fixture();
 await assert.rejects(()=>executeMemberAdminV2({token:'',body:{action:'list'}},deps),error=>error.status===401);
 await assert.rejects(()=>executeMemberAdminV2({token:'bad',body:{action:'list'}},deps),error=>error.status===401);
});

test('TEST-05 create validates six-digit PIN and stores it only through Auth',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 const base={action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',role:'volunteer'};
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{...base,pin:'12345'}},deps),error=>error.status===400&&/6 位/.test(error.message));
 const result=await executeMemberAdminV2({token:'valid-admin',body:{...base,pin:'123456'}},deps);
 assert.equal(result.status,201);assert.equal(result.body.member.status,'pending');
 assert.equal(calls.find(c=>c[0]==='ensureAuth')[1].password,'123456');
 assert.equal('pin' in calls.find(c=>c[0]==='insert')[1],false,'PIN must never be written to member_accounts');
});

test('TEST-05 preserves a leading zero because PIN remains an ASCII string',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'012345',role:'volunteer'}},deps);
 assert.equal(calls.find(c=>c[0]==='ensureAuth')[1].password,'012345');
});

test('TEST-06 account creation remains compatible with shared-phone PIN identities',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'654321',role:'volunteer'}},deps);
 const authPayload=calls.find(c=>c[0]==='ensureAuth')[1],dbPayload=calls.find(c=>c[0]==='insert')[1];
 assert.match(authPayload.email,/^volunteer-[0-9a-f]{32}@auth\.achang\.invalid$/);assert.doesNotMatch(authPayload.email,/22222222/);assert.equal(authPayload.memberId,dbPayload.member_id);assert.equal(dbPayload.login_id,'ACH-22222222222242228222222222222222');
});

test('TEST-07 pending volunteer can be approved with compare-and-set',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'approve',accountId:'11111111-1111-4111-8111-111111111111'}},deps);
 assert.equal(result.body.member.status,'active');const transition=calls.find(c=>c[0]==='transition');assert.deepEqual(transition.slice(2,4),['approve','pending']);
});

test('TEST-08 active admin can create a pending admin without device approval gate',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'123456',role:'admin'}},deps);
 const inserted=calls.find(c=>c[0]==='insert')[1];assert.equal(inserted.role,'admin');assert.equal(inserted.status,'pending');assert.equal(inserted.device_approval_required,false);
 assert.equal(calls.some(c=>c[0]==='deviceCheck'),false);
});

test('active approved volunteer can be promoted without recreating Auth or losing approval',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls,account}=fixture({getAccountById:async()=>({...account,role:'volunteer',status:'active',approved_at:'2026-10-01T00:00:00Z'})});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'promote_admin',accountId:account.id}},deps);
 assert.equal(result.body.promoted,true);assert.equal(result.body.member.role,'admin');assert.equal(result.body.member.status,'active');
 assert.deepEqual(calls.find(call=>call[0]==='promote').slice(1),[account.id,'volunteer','active']);
 assert.equal(calls.some(call=>call[0]==='ensureAuth'||call[0]==='insert'),false);
});

test('promotion rejects pending, suspended, existing admin, and self targets',async()=>{
 const {executeMemberAdminV2}=await corePromise,{account}=fixture();
 for(const target of [{...account,status:'pending'},{...account,status:'suspended',approved_at:'2026-10-01T00:00:00Z'},{...account,role:'admin',status:'active',approved_at:'2026-10-01T00:00:00Z'}]){
  const {deps}=fixture({getAccountById:async()=>target});
  await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'promote_admin',accountId:account.id}},deps),error=>error.code==='INVALID_TRANSITION');
 }
 const {deps}=fixture({getAccountById:async()=>({...account,auth_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'active',approved_at:'2026-10-01T00:00:00Z'})});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'promote_admin',accountId:account.id}},deps),error=>error.code==='SELF_ROLE_CHANGE_FORBIDDEN');
});

test('promotion RPC is invoker-authorized, CAS protected, and audits the role change',()=>{
 const sql=read('supabase/migrations/20261028143000_achang_member_admin_v2_promote_admin.sql');
 assert.match(sql,/security definer/i);assert.match(sql,/set search_path = ''/);assert.match(sql,/not app_private\.is_admin\(\)/);
 assert.match(sql,/role is distinct from p_expected_role/);assert.match(sql,/status is distinct from p_expected_status/);assert.match(sql,/approved_at is null/);
 assert.match(sql,/set role = 'admin', device_approval_required = false/);assert.match(sql,/'member_promoted_admin'/);
 assert.match(sql,/revoke all[\s\S]*from public, anon/);assert.match(sql,/grant execute[\s\S]*to authenticated/);
});

test('TEST-02 current server session contract authenticates active admins without an approved-device gate',()=>{
 const server=read('lib/server.js'),proxy=read('api/member-admin-v2.js');
 assert.match(server,/async function deviceCheck\(req,account,token,requestApproval=false\)\{\s*if\(account\.role==='admin'\)return true/);
 assert.match(proxy,/L\.authorized\(req,res,\['admin'\]\)/);assert.doesNotMatch(proxy,/x-achang-device|deviceCheck/);
});

test('TEST-09 no self escalation or self suspension',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps}=fixture({getAccountById:async()=>({id:'11111111-1111-4111-8111-111111111111',auth_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'admin',status:'active',approved_at:'2026-10-01T00:00:00Z'})});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'suspend',accountId:'11111111-1111-4111-8111-111111111111'}},deps),error=>error.status===409&&/自己/.test(error.message));
});

test('TEST-10 protected principal cannot be suspended',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps}=fixture({getAccountById:async()=>({id:'11111111-1111-4111-8111-111111111111',auth_user_id:'99999999-9999-4999-8999-999999999999',role:'admin',status:'active',approved_at:'2026-10-01T00:00:00Z'}),isProtectedPrincipal:async()=>true});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'suspend',accountId:'11111111-1111-4111-8111-111111111111'}},deps),error=>error.status===403&&error.code==='PROTECTED_PRINCIPAL');
});

test('member archive is recoverable, atomic, and refuses self or protected principals',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls,account}=fixture({getAccountById:async()=>({...account,status:'active',approved_at:'2026-10-01T00:00:00Z'})});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'archive',accountId:account.id,reason:'不再參與服務'}},deps);
 assert.equal(result.body.archived,true);assert.equal(result.body.member.deleted_at,'2026-10-28T07:01:00.000Z');
 assert.deepEqual(calls.find(call=>call[0]==='archive').slice(1),[account.id,'active','不再參與服務']);
 const self=fixture({getAccountById:async()=>({...account,auth_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'active'})});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'archive',accountId:account.id,reason:'不再參與服務'}},self.deps),error=>error.code==='SELF_ARCHIVE_FORBIDDEN');
 const protectedTarget=fixture({getAccountById:async()=>({...account,status:'active'}),isProtectedPrincipal:async()=>true});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'archive',accountId:account.id,reason:'不再參與服務'}},protectedTarget.deps),error=>error.code==='PROTECTED_PRINCIPAL');
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'archive',accountId:account.id,reason:'x'}},deps),error=>error.status===400);
});

test('archive migration revokes access, retains history, audits, and protects the final administrator',()=>{
 const sql=read('supabase/migrations/20261028140901_achang_member_admin_v2_archive_member.sql');
 assert.match(sql,/security definer/i);assert.match(sql,/set search_path = ''/);assert.match(sql,/not app_private\.is_admin\(\)/);
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/for update/);assert.match(sql,/status is distinct from p_expected_status/);
 assert.match(sql,/protected principal cannot be archived/);assert.match(sql,/last active administrator cannot be archived/);assert.match(sql,/cannot archive own account/);
 assert.match(sql,/update public\.member_devices[\s\S]*status = 'revoked'/);assert.match(sql,/update public\.member_accounts[\s\S]*status = 'suspended'/);
 assert.match(sql,/delete from public\.service_allocations/);assert.match(sql,/update public\.members[\s\S]*deleted_at = v_now/);
 assert.match(sql,/insert into public\.member_authorization_events[\s\S]*'member_archived'/);
 assert.doesNotMatch(sql,/delete from public\.(?:members|member_accounts|member_devices|member_authorization_events)/);
 assert.doesNotMatch(sql,/auth\.users|deleteUser/);assert.match(sql,/revoke all on function[\s\S]*from public, anon/);assert.match(sql,/grant execute[\s\S]*to authenticated/);
});

test('archived members are removed from current roster and authorization list',()=>{
 const roster=read('api/roster.js'),edge=read('supabase/functions/achang-member-admin-v2/index.ts');
 assert.match(roster,/members\?deleted_at=is\.null/);assert.match(edge,/filter\(member=>!member\.deleted_at\)/);
 assert.match(edge,/visibleAccountIds/);assert.match(edge,/\.filter\(device=>visibleAccountIds\.has/);
});

test('legacy roster removal is labeled as recoverable archive and routes authorized accounts to protected member archive',()=>{
 const app=read('app.js'),roster=read('api/roster.js');
 assert.match(app,/確認封存人員/);assert.match(app,/這是可恢復的封存，不會永久清除歷史資料/);
 assert.match(app,/請改由「會員授權」執行受保護的會員封存/);assert.match(app,/確認封存/);
 assert.match(roster,/member_accounts\?member_id=eq\./);assert.match(roster,/此人員已有會員授權/);
 assert.match(roster,/source_member_id:'ARCHIVED-'/);assert.doesNotMatch(roster,/delete from|deleteUser/);
});

test('suspend and reactivate use one atomic transition RPC contract',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls,account}=fixture({getAccountById:async()=>({...account,status:'active',approved_at:'2026-10-01T00:00:00Z'})});
 await executeMemberAdminV2({token:'valid-admin',body:{action:'suspend',accountId:account.id}},deps);
 assert.deepEqual(calls.filter(c=>c[0]==='transition').map(c=>c.slice(2,4)),[['suspend','active']]);
 const second=fixture({getAccountById:async()=>({...account,status:'suspended',approved_at:'2026-10-01T00:00:00Z'})});
 await executeMemberAdminV2({token:'valid-admin',body:{action:'reactivate',accountId:account.id}},second.deps);
 assert.deepEqual(second.calls.filter(c=>c[0]==='transition').map(c=>c.slice(2,4)),[['reactivate','suspended']]);
});

test('archived members cannot be approved, reactivated, promoted, or authenticated',async()=>{
 const {executeMemberAdminV2}=await corePromise,{account}=fixture();
 for(const [action,target] of [['approve',{...account,status:'pending'}],['reactivate',{...account,status:'suspended',approved_at:'2026-10-01T00:00:00Z'}],['promote_admin',{...account,status:'active',approved_at:'2026-10-01T00:00:00Z'}]]){
  const {deps}=fixture({getAccountById:async()=>target,isMemberArchived:async()=>true});
  await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action,accountId:account.id}},deps),error=>error.code==='MEMBER_ARCHIVED');
 }
 const migration=read('supabase/migrations/20261028144500_achang_member_admin_v2_archived_guard.sql'),server=read('lib/server.js'),edge=read('supabase/functions/achang-member-admin-v2/index.ts');
 assert.match(migration,/join public\.members m on m\.id = a\.member_id and m\.deleted_at is null/);assert.match(server,/members\?id=eq\.[\s\S]*deleted_at=is\.null/);assert.match(edge,/is\('deleted_at',null\)/);
});

test('session authorization distinguishes missing, pending, suspended, and archived membership without changing access',()=>{
 const server=read('lib/server.js');
 assert.match(server,/if\(!p\)problem\(403,'此 Google 帳號尚未建立會員授權'\)/);assert.match(server,/p\.status==='pending'[\s\S]*等待管理員核准/);assert.match(server,/p\.status!=='active'[\s\S]*會員帳號已停用/);assert.match(server,/deleted_at=is\.null[\s\S]*會員已封存或無法使用/);
});

test('archiving an allocation cannot cascade into retained assignments, tasks, events, or authorization history',()=>{
 const archive=read('supabase/migrations/20261028140901_achang_member_admin_v2_archive_member.sql');
 assert.match(archive,/delete from public\.service_allocations where member_id/);
 assert.doesNotMatch(archive,/delete from public\.(?:assignments|visit_tasks|task_events|member_authorization_events)/);
});

test('duplicate create is idempotent and never resets PIN or role',async()=>{
 const existing={id:'11111111-1111-4111-8111-111111111111',member_id:'22222222-2222-4222-8222-222222222222',role:'volunteer',status:'pending'};
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture({getAccountByMember:async()=>existing});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:existing.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},deps);
 assert.equal(result.body.idempotent,true);assert.equal(calls.some(c=>c[0]==='ensureAuth'),false);
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:existing.member_id,phone:'+886900000001',pin:'123456',role:'admin'}},deps),error=>error.status===409);
});

test('partial create retains the deterministic Auth identity for ownership-safe retry',async()=>{
 const {executeMemberAdminV2}=await corePromise;
 const first=fixture({insertAccount:async()=>{throw new Error('synthetic database failure')}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'123456',role:'volunteer'}},first.deps),error=>error.status===503&&error.code==='CREATE_RETRY_REQUIRED');
 assert.equal(first.calls.some(call=>call[0]==='deleteAuth'),false);
});

test('unknown insert outcome never deletes Auth blindly and a retry reconciles the committed account',async()=>{
 const {executeMemberAdminV2}=await corePromise;let reads=0;
 const uncertain=fixture({insertAccount:async()=>{throw new Error('synthetic timeout after write')},getAccountByMember:async()=>{reads++;if(reads===1)return null;throw new Error('synthetic reconciliation outage')}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'123456',role:'volunteer'}},uncertain.deps),error=>error.status===503&&error.code==='CREATE_OUTCOME_UNKNOWN');
 assert.equal(uncertain.calls.some(call=>call[0]==='deleteAuth'),false,'unknown commit outcome must retain the possibly committed Auth identity');
 const committed={id:'11111111-1111-4111-8111-111111111111',member_id:'22222222-2222-4222-8222-222222222222',auth_user_id:'44444444-4444-4444-8444-444444444444',role:'volunteer',status:'pending'};
 const retry=fixture({getAccountByMember:async()=>committed});const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:committed.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},retry.deps);
 assert.equal(result.body.idempotent,true);assert.equal(retry.calls.some(call=>call[0]==='ensureAuth'),false);
});

test('unknown non-commit retry reuses one persisted Auth identity instead of creating another alias',async()=>{
 const {executeMemberAdminV2}=await corePromise,emails=[];
 const shared={authAlias:async()=> 'abcdef0123456789abcdef0123456789',ensureAuthUser:async payload=>{emails.push(payload.email);return {id:'44444444-4444-4444-8444-444444444444'}}};
 let reads=0;const first=fixture({...shared,insertAccount:async()=>{throw new Error('timeout before commit')},getAccountByMember:async()=>{reads++;if(reads===1)return null;throw new Error('reconciliation unavailable')}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:first.account.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},first.deps),error=>error.code==='CREATE_OUTCOME_UNKNOWN');
 const second=fixture({...shared,getAccountByMember:async()=>null});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:second.account.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},second.deps);
 assert.equal(result.status,201);assert.equal(emails.length,2);assert.equal(emails[0],emails[1]);assert.equal(first.calls.some(call=>call[0]==='deleteAuth'),false);
});

test('Auth operation alias is persisted before Auth creation and survives credential rotation',()=>{
 const sql=read('supabase/migrations/20261028094500_achang_member_auth_operation_identity.sql'),hardening=read('supabase/migrations/20261028115000_achang_member_auth_operation_invoker_hardening.sql'),edge=read('supabase/functions/achang-member-admin-v2/index.ts');
 assert.match(sql,/app_private\.achang_member_auth_operations/);assert.match(sql,/member_id uuid primary key/);assert.match(sql,/auth_alias text not null unique/);
 assert.match(sql,/security definer/);assert.match(sql,/not app_private\.is_admin\(\)/);assert.match(sql,/on conflict\(member_id\) do nothing/);assert.match(sql,/requested_role<>p_role/);
 assert.match(edge,/userClient\.rpc\('achang_prepare_member_auth_identity'/);assert.doesNotMatch(edge,/member-admin-v2-auth-alias|serviceKey\+'\|member-admin-v2-auth-alias/);
 assert.match(hardening,/enable row level security/);assert.match(hardening,/to authenticated[\s\S]*app_private\.is_admin/);assert.match(hardening,/grant select, insert/);assert.match(hardening,/security invoker/);
 assert.doesNotMatch(hardening,/grant (?:update|delete|all) on table[\s\S]*to authenticated/i);
 const core=read('supabase/functions/_shared/member-admin-v2-core.mjs');assert.ok(core.indexOf('await deps.authAlias')<core.indexOf('await deps.ensureAuthUser'));
});

test('interleaved failed A never deletes the shared Auth identity successfully inserted by B',async()=>{
 const {executeMemberAdminV2}=await corePromise,sharedId='44444444-4444-4444-8444-444444444444';
 const shared={authAlias:async()=> 'fedcba9876543210fedcba9876543210',ensureAuthUser:async()=>({id:sharedId})};
 const request={token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'123456',role:'volunteer'}};
 const a=fixture({...shared,insertAccount:async()=>{throw new Error('A insert failed')},getAccountByMember:async()=>null});
 await assert.rejects(()=>executeMemberAdminV2(request,a.deps),error=>error.code==='CREATE_RETRY_REQUIRED');
 const b=fixture({...shared,getAccountByMember:async()=>null});const done=await executeMemberAdminV2(request,b.deps);
 assert.equal(done.status,201);assert.equal(b.calls.find(call=>call[0]==='insert')[1].auth_user_id,sharedId);
 assert.equal(a.calls.some(call=>call[0]==='deleteAuth'),false);assert.equal(b.calls.some(call=>call[0]==='deleteAuth'),false);
});

test('Auth commit with lost response retries the same identity before any account insert',async()=>{
 const {executeMemberAdminV2}=await corePromise,emails=[];let first=true;
 const stable={authAlias:async()=> '1234567890abcdef1234567890abcdef',ensureAuthUser:async payload=>{emails.push(payload.email);if(first){first=false;throw new Error('create committed but response and lookup were lost')}return {id:'44444444-4444-4444-8444-444444444444'}}};
 const failed=fixture({...stable,getAccountByMember:async()=>null});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:failed.account.member_id,phone:'+886900000001',pin:'012345',role:'volunteer'}},failed.deps),error=>error.status===502);
 assert.equal(failed.calls.some(call=>call[0]==='insert'),false,'account insert cannot run without a resolved Auth identity');
 const retry=fixture({...stable,getAccountByMember:async()=>null});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:retry.account.member_id,phone:'+886900000001',pin:'012345',role:'volunteer'}},retry.deps);
 assert.equal(result.status,201);assert.equal(emails.length,2);assert.equal(emails[0],emails[1]);assert.equal(retry.calls.filter(call=>call[0]==='insert').length,1);
});

test('application email route blocks synthetic identities without changing existing Auth protections',()=>{
 const session=read('api/session.js');assert.match(session,/@auth\\\.achang\\\.invalid\$\/i/);assert.match(session,/名冊手機與六位數字 PIN/);
 const guardIndex=session.indexOf('@auth\\.achang\\.invalid'),passwordGrant=session.indexOf('/auth/v1/token?grant_type=password');assert.ok(guardIndex>0&&guardIndex<passwordGrant);
 assert.doesNotMatch(session,/disable.*rate.?limit|bypass.*rate.?limit/i);
});

test('concurrent retry returns the committed matching account but rejects role mismatch',async()=>{
 const {executeMemberAdminV2}=await corePromise;
 const matching={id:'11111111-1111-4111-8111-111111111111',member_id:'22222222-2222-4222-8222-222222222222',role:'volunteer',status:'pending'};
 let reads=0;const good=fixture({getAccountByMember:async()=>++reads===1?null:matching,ensureAuthUser:async()=>{throw Object.assign(new Error('duplicate'),{status:422})}});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:matching.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},good.deps);assert.equal(result.body.idempotent,true);
 reads=0;const bad=fixture({getAccountByMember:async()=>++reads===1?null:{...matching,role:'admin'},ensureAuthUser:async()=>{throw Object.assign(new Error('duplicate'),{status:422})}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:matching.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},bad.deps),error=>error.status===409);
});

test('TEST-12 Edge adapter uses user-scoped RLS writes and has no device or hard-delete gate',()=>{
 const edge=read('supabase/functions/achang-member-admin-v2/index.ts'),core=read('supabase/functions/_shared/member-admin-v2-core.mjs');
 assert.match(edge,/global:\{headers:\{Authorization:bearer\}\}/);
 assert.match(edge,/getActiveAdmin/);assert.match(edge,/role','admin'/);assert.match(edge,/status','active'/);
 assert.doesNotMatch(edge,/device_id_hash|Approved administrator device|requiredApprovedDevice/);
 assert.doesNotMatch(edge,/\.delete\(\).*member_accounts|deleteUser\(target/);
 assert.doesNotMatch(edge,/deleteAuthUser|admin\.auth\.admin\.deleteUser/);
 assert.match(core,/device_approval_required:requestedRole!=='admin'/);
 assert.match(edge,/protectedPrincipalHashByProject/);assert.match(edge,/await sha\(String\(account\.auth_user_id\)\)===protectedPrincipalHash/);
 assert.doesNotMatch(edge,/299cd935-bfd4-4847-b355-996018e63a17|a43a90bf-6bc2-48af-bf68-a33c26c6a284/);
 assert.match(edge,/member_admin_v2_denied/);assert.doesNotMatch(edge,/console\.(?:warn|error)\([^\n]*(?:password|pin|body)/i);
});

test('API proxy forwards only authenticated admin commands to v2 and no device proof',async()=>{
 const source=read('api/member-admin-v2.js'),module={exports:{}},captured=[];
 const L={run:fn=>fn,method(){},authorized:async()=>({token:'actor-token',role:'admin'}),body:req=>req.body,phone:value=>value,request:async(path,options)=>{captured.push({path,options});return {ok:true,status:201,data:{ok:true}}},json(res,status,body){res.status=status;res.body=body},problem(status,message){throw Object.assign(new Error(message),{status})}};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`) (id=>id==='../lib/server'?L:require(id),module,module.exports);
 const res={};await module.exports({method:'POST',headers:{},body:{action:'create',phone:'0912-345-678'}},res);
 assert.equal(captured[0].path,'/functions/v1/achang-member-admin-v2');assert.equal(captured[0].options.token,'actor-token');assert.equal(captured[0].options.headers,undefined);assert.equal(res.status,201);
});

test('API proxy accepts explicit archive and promotion lifecycle actions but rejects hard delete',async()=>{
 const source=read('api/member-admin-v2.js'),module={exports:{}},captured=[];
 const L={run:fn=>fn,method(){},authorized:async()=>({token:'actor-token',role:'admin'}),body:req=>req.body,request:async(path,options)=>{captured.push({path,options});return {ok:true,status:200,data:{ok:true,archived:true}}},json(res,status,body){res.status=status;res.body=body},problem(status,message){throw Object.assign(new Error(message),{status})}};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:require(id),module,module.exports);
 await module.exports({method:'PATCH',headers:{},body:{action:'archive',accountId:'11111111-1111-4111-8111-111111111111',reason:'不再參與服務'}},{});
 assert.equal(captured[0].options.body.action,'archive');
 await module.exports({method:'PATCH',headers:{},body:{action:'promote_admin',accountId:'11111111-1111-4111-8111-111111111111'}},{});
 assert.equal(captured[1].options.body.action,'promote_admin');
 await assert.rejects(()=>module.exports({method:'PATCH',headers:{},body:{action:'delete',accountId:'11111111-1111-4111-8111-111111111111'}},{}),error=>error.status===400);
});

test('actual server wrapper preserves stable v2 application error codes',async()=>{
 const source=read('api/member-admin-v2.js'),module={exports:{}},realL=require('../lib/server');
 const L={...realL,authorized:async()=>({token:'actor-token',role:'admin'}),body:req=>req.body,request:async()=>({ok:false,status:503,data:{error:'帳號建立結果尚待確認',code:'CREATE_OUTCOME_UNKNOWN'}})};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:require(id),module,module.exports);
 const req={method:'POST',headers:{},body:{action:'create',phone:'0912-345-678'}},res={headers:{},setHeader(k,v){this.headers[k]=v},end(value){this.body=JSON.parse(value);this.writableEnded=true}};
 await module.exports(req,res);
 assert.equal(res.statusCode,503);assert.equal(res.body.code,'CREATE_OUTCOME_UNKNOWN');assert.equal(res.body.error,'帳號建立結果尚待確認');
});

test('actual API phone parser accepts only 09xx-xxx-xxx, bare 09, or +886 before the v2 handler',async()=>{
 const source=read('api/member-admin-v2.js'),realL=require('../lib/server');
 for(const [input,expected] of [['0912-345-678','+886912345678'],['0912345678','+886912345678'],['+886912345678','+886912345678']]){
  const module={exports:{}},captured=[];const L={...realL,run:fn=>fn,method(){},authorized:async()=>({token:'actor-token',role:'admin'}),body:req=>req.body,request:async(path,options)=>{captured.push({path,options});return {ok:true,status:201,data:{ok:true}}},json(res,status,body){res.status=status;res.body=body},problem(status,message){throw Object.assign(new Error(message),{status})}};
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:require(id),module,module.exports);
  await module.exports({method:'POST',headers:{},body:{action:'create',phone:input}},{});assert.equal(captured[0].options.body.phone,expected);
 }
 const module={exports:{}},L={...realL,run:fn=>fn,method(){},authorized:async()=>({token:'actor-token',role:'admin'}),body:req=>req.body,problem(status,message){throw Object.assign(new Error(message),{status})}};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:require(id),module,module.exports);
 for(const invalid of ['not-a-phone','0912abc345678','0912 345 678','+886-912-345-678']){
  await assert.rejects(()=>module.exports({method:'POST',headers:{},body:{action:'create',phone:invalid}},{}),error=>error.status===400&&/09xx-xxx-xxx/.test(error.message));
 }
});

test('database transition RPC is atomic, invoker-authorized, CAS protected, and preserves device revocation on rollback',()=>{
 const sql=read('supabase/migrations/20261028090000_achang_member_admin_v2_atomic_transition.sql');
 assert.match(sql,/security invoker/i);assert.match(sql,/not app_private\.is_admin\(\)/);
 assert.match(sql,/for update/);assert.match(sql,/status is distinct from p_expected_status/);
 assert.match(sql,/update public\.member_devices[\s\S]*update public\.member_accounts/);
 assert.doesNotMatch(sql,/exception[\s\S]*commit|begin[\s\S]*commit/i);
 assert.match(sql,/protected principal cannot be suspended/);assert.match(sql,/v_account\.auth_user_id = v_actor/);
 assert.match(sql,/revoke all on function[\s\S]*from public, anon/);assert.match(sql,/grant execute[\s\S]*to authenticated/);
 const edge=read('supabase/functions/achang-member-admin-v2/index.ts');assert.match(edge,/\.rpc\('achang_member_admin_v2_transition'/);assert.doesNotMatch(edge,/revokeDevices|updateAccountCas/);
 assert.match(edge,/error\.code==='40001'[\s\S]*MemberAdminError\(409/);assert.match(edge,/error\.code==='42501'[\s\S]*MemberAdminError\(403/);
});

test('legacy members route keeps protected device management but rejects account lifecycle bypasses',async()=>{
 const source=read('api/members.js');assert.doesNotMatch(source,/achang-admin-provision|deleteUser|authUserId/);assert.match(source,/會員帳號生命週期已移至新版安全 API/);
 assert.match(source,/管理員裝置不得由一般撤銷操作解除/);
 const module={exports:{}},L={run:fn=>fn,method(req,allowed){if(!allowed.includes(req.method))throw Object.assign(new Error('method'),{status:405})},authorized:async()=>({token:'actor',auth_user_id:'actor'}),body:req=>req.body,problem(status,message){throw Object.assign(new Error(message),{status})}};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:require(id),module,module.exports);
 await assert.rejects(()=>module.exports({method:'POST',headers:{},body:{}},{}),error=>error.status===405);
 await assert.rejects(()=>module.exports({method:'PATCH',headers:{},body:{enabled:false,authUserId:'33333333-3333-4333-8333-333333333333'}},{}),error=>error.status===410);
});

