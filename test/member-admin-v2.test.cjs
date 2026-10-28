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
  calls,now:()=> '2026-10-28T07:00:00.000Z',newAuthAlias:()=> '55555555-5555-4555-8555-555555555555',publicAccount:a=>({...a}),
  authenticate:async token=>token==='valid-admin'?{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'admin@example.invalid'}:null,
  getActiveAdmin:async id=>id==='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'?{id:'admin-account',role:'admin',status:'active'}:null,
  rateLimit:async(id,action)=>calls.push(['rate',id,action]),
  getMember:async id=>({id,phone_e164:'+886900000001',display_name:'合成會員',deleted_at:null}),
  getAccountByMember:async()=>null,getAccountById:async()=>account,
  createAuthUser:async payload=>{calls.push(['createAuth',payload]);return {id:'44444444-4444-4444-8444-444444444444'}},
  deleteAuthUser:async id=>{calls.push(['deleteAuth',id]);return true},
  insertAccount:async values=>{calls.push(['insert',values]);return {...account,...values,id:account.id}},
  transitionAccountAtomic:async(id,action,status,reason)=>{calls.push(['transition',id,action,status,reason]);return {...account,status:action==='suspend'?'suspended':'active'}},
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
 assert.equal(calls.find(c=>c[0]==='createAuth')[1].password,'123456');
 assert.equal('pin' in calls.find(c=>c[0]==='insert')[1],false,'PIN must never be written to member_accounts');
});

test('TEST-05 preserves a leading zero because PIN remains an ASCII string',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'012345',role:'volunteer'}},deps);
 assert.equal(calls.find(c=>c[0]==='createAuth')[1].password,'012345');
});

test('TEST-06 account creation remains compatible with shared-phone PIN identities',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'654321',role:'volunteer'}},deps);
 const authPayload=calls.find(c=>c[0]==='createAuth')[1],dbPayload=calls.find(c=>c[0]==='insert')[1];
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

test('suspend and reactivate use one atomic transition RPC contract',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls,account}=fixture({getAccountById:async()=>({...account,status:'active',approved_at:'2026-10-01T00:00:00Z'})});
 await executeMemberAdminV2({token:'valid-admin',body:{action:'suspend',accountId:account.id}},deps);
 assert.deepEqual(calls.filter(c=>c[0]==='transition').map(c=>c.slice(2,4)),[['suspend','active']]);
 const second=fixture({getAccountById:async()=>({...account,status:'suspended',approved_at:'2026-10-01T00:00:00Z'})});
 await executeMemberAdminV2({token:'valid-admin',body:{action:'reactivate',accountId:account.id}},second.deps);
 assert.deepEqual(second.calls.filter(c=>c[0]==='transition').map(c=>c.slice(2,4)),[['reactivate','suspended']]);
});

test('duplicate create is idempotent and never resets PIN or role',async()=>{
 const existing={id:'11111111-1111-4111-8111-111111111111',member_id:'22222222-2222-4222-8222-222222222222',role:'volunteer',status:'pending'};
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture({getAccountByMember:async()=>existing});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:existing.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},deps);
 assert.equal(result.body.idempotent,true);assert.equal(calls.some(c=>c[0]==='createAuth'),false);
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:existing.member_id,phone:'+886900000001',pin:'123456',role:'admin'}},deps),error=>error.status===409);
});

test('partial create compensates Auth user and fails closed when cleanup cannot be proven',async()=>{
 const {executeMemberAdminV2}=await corePromise;
 const first=fixture({insertAccount:async()=>{throw new Error('synthetic database failure')}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'123456',role:'volunteer'}},first.deps),error=>error.status===409);
 assert.equal(first.calls.some(call=>call[0]==='deleteAuth'),true);
 const second=fixture({insertAccount:async()=>{throw new Error('synthetic database failure')},deleteAuthUser:async id=>{second.calls.push(['deleteAuth',id]);return false}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'123456',role:'volunteer'}},second.deps),error=>error.status===503);
});

test('unknown insert outcome never deletes Auth blindly and a retry reconciles the committed account',async()=>{
 const {executeMemberAdminV2}=await corePromise;let reads=0;
 const uncertain=fixture({insertAccount:async()=>{throw new Error('synthetic timeout after write')},getAccountByMember:async()=>{reads++;if(reads===1)return null;throw new Error('synthetic reconciliation outage')}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:'22222222-2222-4222-8222-222222222222',phone:'+886900000001',pin:'123456',role:'volunteer'}},uncertain.deps),error=>error.status===503&&error.code==='CREATE_OUTCOME_UNKNOWN');
 assert.equal(uncertain.calls.some(call=>call[0]==='deleteAuth'),false,'unknown commit outcome must retain the possibly committed Auth identity');
 const committed={id:'11111111-1111-4111-8111-111111111111',member_id:'22222222-2222-4222-8222-222222222222',auth_user_id:'44444444-4444-4444-8444-444444444444',role:'volunteer',status:'pending'};
 const retry=fixture({getAccountByMember:async()=>committed});const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:committed.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},retry.deps);
 assert.equal(result.body.idempotent,true);assert.equal(retry.calls.some(call=>call[0]==='createAuth'),false);
});

test('synthetic Auth email cannot bypass the phone PIN rate-limited login path',()=>{
 const session=read('api/session.js');assert.match(session,/@auth\\\.achang\\\.invalid\$\/i/);assert.match(session,/名冊手機與六位數字 PIN/);
 const guardIndex=session.indexOf('@auth\\.achang\\.invalid'),passwordGrant=session.indexOf('/auth/v1/token?grant_type=password');assert.ok(guardIndex>0&&guardIndex<passwordGrant);
});

test('concurrent retry returns the committed matching account but rejects role mismatch',async()=>{
 const {executeMemberAdminV2}=await corePromise;
 const matching={id:'11111111-1111-4111-8111-111111111111',member_id:'22222222-2222-4222-8222-222222222222',role:'volunteer',status:'pending'};
 let reads=0;const good=fixture({getAccountByMember:async()=>++reads===1?null:matching,createAuthUser:async()=>{throw Object.assign(new Error('duplicate'),{status:422})}});
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:matching.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},good.deps);assert.equal(result.body.idempotent,true);
 reads=0;const bad=fixture({getAccountByMember:async()=>++reads===1?null:{...matching,role:'admin'},createAuthUser:async()=>{throw Object.assign(new Error('duplicate'),{status:422})}});
 await assert.rejects(()=>executeMemberAdminV2({token:'valid-admin',body:{action:'create',memberId:matching.member_id,phone:'+886900000001',pin:'123456',role:'volunteer'}},bad.deps),error=>error.status===409);
});

test('TEST-12 Edge adapter uses user-scoped RLS writes and has no device or hard-delete gate',()=>{
 const edge=read('supabase/functions/achang-member-admin-v2/index.ts'),core=read('supabase/functions/_shared/member-admin-v2-core.mjs');
 assert.match(edge,/global:\{headers:\{Authorization:bearer\}\}/);
 assert.match(edge,/getActiveAdmin/);assert.match(edge,/role','admin'/);assert.match(edge,/status','active'/);
 assert.doesNotMatch(edge,/device_id_hash|Approved administrator device|requiredApprovedDevice/);
 assert.doesNotMatch(edge,/\.delete\(\).*member_accounts|deleteUser\(target/);
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
});

test('legacy members route keeps device management but rejects account lifecycle bypasses',async()=>{
 const source=read('api/members.js');assert.doesNotMatch(source,/achang-admin-provision|deleteUser|member_accounts\?id=eq/);assert.match(source,/會員帳號生命週期已移至新版安全 API/);
 const module={exports:{}},L={run:fn=>fn,method(req,allowed){if(!allowed.includes(req.method))throw Object.assign(new Error('method'),{status:405})},authorized:async()=>({token:'actor',auth_user_id:'actor'}),body:req=>req.body,problem(status,message){throw Object.assign(new Error(message),{status})}};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:require(id),module,module.exports);
 await assert.rejects(()=>module.exports({method:'POST',headers:{},body:{}},{}),error=>error.status===405);
 await assert.rejects(()=>module.exports({method:'PATCH',headers:{},body:{enabled:false,authUserId:'33333333-3333-4333-8333-333333333333'}},{}),error=>error.status===410);
});
