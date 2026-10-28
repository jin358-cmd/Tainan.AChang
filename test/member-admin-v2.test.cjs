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
  calls,now:()=> '2026-10-28T07:00:00.000Z',publicAccount:a=>({...a}),
  authenticate:async token=>token==='valid-admin'?{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'admin@example.invalid'}:null,
  getActiveAdmin:async id=>id==='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'?{id:'admin-account',role:'admin',status:'active'}:null,
  rateLimit:async(id,action)=>calls.push(['rate',id,action]),
  getMember:async id=>({id,phone_e164:'+886900000001',display_name:'合成會員',deleted_at:null}),
  getAccountByMember:async()=>null,getAccountById:async()=>account,
  createAuthUser:async payload=>{calls.push(['createAuth',payload]);return {id:'44444444-4444-4444-8444-444444444444'}},
  deleteAuthUser:async id=>{calls.push(['deleteAuth',id]);return true},
  insertAccount:async values=>{calls.push(['insert',values]);return {...account,...values,id:account.id}},
  updateAccountCas:async(id,status,patch)=>{calls.push(['update',id,status,patch]);return {...account,...patch}},
  revokeDevices:async(id,now)=>{calls.push(['revoke',id,now]);return true},
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
 assert.match(authPayload.email,/^volunteer-[0-9a-f-]+@auth\.achang\.invalid$/);assert.equal(authPayload.memberId,dbPayload.member_id);assert.equal(dbPayload.login_id,'ACH-22222222222242228222222222222222');
});

test('TEST-07 pending volunteer can be approved with compare-and-set',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls}=fixture();
 const result=await executeMemberAdminV2({token:'valid-admin',body:{action:'approve',accountId:'11111111-1111-4111-8111-111111111111'}},deps);
 assert.equal(result.body.member.status,'active');const update=calls.find(c=>c[0]==='update');assert.equal(update[2],'pending');assert.equal(update[3].approved_by,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
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

test('suspend revokes devices before status CAS; reactivate never restores devices',async()=>{
 const {executeMemberAdminV2}=await corePromise,{deps,calls,account}=fixture({getAccountById:async()=>({...account,status:'active',approved_at:'2026-10-01T00:00:00Z'})});
 await executeMemberAdminV2({token:'valid-admin',body:{action:'suspend',accountId:account.id}},deps);
 assert.deepEqual(calls.filter(c=>['revoke','update'].includes(c[0])).map(c=>c[0]),['revoke','update']);
 const second=fixture({getAccountById:async()=>({...account,status:'suspended',approved_at:'2026-10-01T00:00:00Z'})});
 await executeMemberAdminV2({token:'valid-admin',body:{action:'reactivate',accountId:account.id}},second.deps);
 assert.equal(second.calls.some(c=>c[0]==='revoke'),false);assert.equal(second.calls.find(c=>c[0]==='update')[2],'suspended');
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
 assert.match(edge,/ACHANG_PROTECTED_AUTH_USER_ID/);assert.match(edge,/account\.auth_user_id===protectedUserId/);
 assert.match(edge,/member_admin_v2_denied/);assert.doesNotMatch(edge,/console\.(?:warn|error)\([^\n]*(?:password|pin|body)/i);
});

test('API proxy forwards only authenticated admin commands to v2 and no device proof',async()=>{
 const source=read('api/member-admin-v2.js'),module={exports:{}},captured=[];
 const L={run:fn=>fn,method(){},authorized:async()=>({token:'actor-token',role:'admin'}),body:req=>req.body,request:async(path,options)=>{captured.push({path,options});return {ok:true,status:201,data:{ok:true}}},json(res,status,body){res.status=status;res.body=body},problem(status,message){throw Object.assign(new Error(message),{status})}};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`) (id=>id==='../lib/server'?L:require(id),module,module.exports);
 const res={};await module.exports({method:'POST',headers:{},body:{action:'create'}},res);
 assert.equal(captured[0].path,'/functions/v1/achang-member-admin-v2');assert.equal(captured[0].options.token,'actor-token');assert.equal(captured[0].options.headers,undefined);assert.equal(res.status,201);
});

test('legacy members route keeps device management but rejects account lifecycle bypasses',async()=>{
 const source=read('api/members.js');assert.doesNotMatch(source,/achang-admin-provision|deleteUser|member_accounts\?id=eq/);assert.match(source,/會員帳號生命週期已移至新版安全 API/);
 const module={exports:{}},L={run:fn=>fn,method(req,allowed){if(!allowed.includes(req.method))throw Object.assign(new Error('method'),{status:405})},authorized:async()=>({token:'actor',auth_user_id:'actor'}),body:req=>req.body,problem(status,message){throw Object.assign(new Error(message),{status})}};
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(id=>id==='../lib/server'?L:require(id),module,module.exports);
 await assert.rejects(()=>module.exports({method:'POST',headers:{},body:{}},{}),error=>error.status===405);
 await assert.rejects(()=>module.exports({method:'PATCH',headers:{},body:{enabled:false,authUserId:'33333333-3333-4333-8333-333333333333'}},{}),error=>error.status===410);
});
