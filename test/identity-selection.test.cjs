const test=require('node:test');
const assert=require('node:assert/strict');

let helpers;
test.before(async()=>{helpers=await import('../supabase/functions/_shared/identity-selection.mjs')});

const account=(id,status='active')=>({id,status});
const session=id=>({access_token:'token-'+id});

test('ambiguous cleanup failure revokes every created session and returns error',async()=>{
 const revoked=[];
 const result=await helpers.authenticateAccountCandidates({
  accounts:[account('a'),account('b')],getEmail:async a=>a.id+'@test',
  signIn:async a=>({session:session(a.id),verified:true}),
  revokeSession:async s=>{revoked.push(s.access_token);return s.access_token!=='token-a'}
 });
 assert.deepEqual(result,{kind:'error'});assert.deepEqual(revoked,['token-a','token-b']);
});

test('later Auth exception cleans mismatched and provisional selected sessions',async()=>{
 const revoked=[];
 const result=await helpers.authenticateAccountCandidates({
  accounts:[account('mismatch'),account('selected'),account('throws')],
  getEmail:async a=>{if(a.id==='throws')throw Error('auth lookup failed');return a.id+'@test'},
  signIn:async a=>({session:session(a.id),verified:a.id!=='mismatch'}),
  revokeSession:async s=>{revoked.push(s.access_token);return true}
 });
 assert.deepEqual(result,{kind:'error'});assert.deepEqual(revoked,['token-mismatch','token-selected']);
});

test('cleanup failure also revokes a provisional selected session',async()=>{
 const revoked=[];
 const result=await helpers.authenticateAccountCandidates({
  accounts:[account('mismatch'),account('selected')],getEmail:async a=>a.id+'@test',
  signIn:async a=>({session:session(a.id),verified:a.id==='selected'}),
  revokeSession:async s=>{revoked.push(s.access_token);return s.access_token!=='token-mismatch'}
 });
 assert.deepEqual(result,{kind:'error'});assert.deepEqual(revoked,['token-mismatch','token-selected']);
});

test('pending and suspended accounts never retain sessions',async()=>{
 for(const status of ['pending','suspended']){
  const revoked=[];
  const result=await helpers.authenticateAccountCandidates({accounts:[account(status,status)],getEmail:async()=>status+'@test',signIn:async()=>({session:session(status),verified:true}),revokeSession:async s=>{revoked.push(s.access_token);return true}});
  assert.equal(result.kind,'blocked');assert.deepEqual(revoked,['token-'+status]);
 }
});

test('mismatched binding is invalid and its created session is revoked',async()=>{
 const revoked=[];
 const result=await helpers.authenticateAccountCandidates({accounts:[account('m')],getEmail:async()=>'m@test',signIn:async()=>({session:session('m'),verified:false}),revokeSession:async s=>{revoked.push(s.access_token);return true}});
 assert.deepEqual(result,{kind:'invalid'});assert.deepEqual(revoked,['token-m']);
});

test('audit and response failures revoke the retained session',async()=>{
 for(const variant of ['audit-false','audit-throw','build-throw']){
  const revoked=[];
  const result=await helpers.returnAuthenticatedSession({session:session(variant),audit:async()=>{if(variant==='audit-throw')throw Error('audit');return variant!=='audit-false'},revokeSession:async s=>{revoked.push(s.access_token);return true},buildResult:async()=>{if(variant==='build-throw')throw Error('build');return {ok:true}}});
  assert.deepEqual(result,{ok:false});assert.deepEqual(revoked,['token-'+variant]);
 }
});

test('successful response retains exactly its returned session',async()=>{
 const revoked=[];
 const decision=await helpers.authenticateAccountCandidates({accounts:[account('selected')],getEmail:async()=>'selected@test',signIn:async()=>({session:session('selected'),verified:true}),revokeSession:async s=>{revoked.push(s.access_token);return true}});
 assert.equal(decision.kind,'selected');assert.deepEqual(revoked,[]);
 const delivered=await helpers.returnAuthenticatedSession({session:decision.session,audit:async()=>true,revokeSession:async s=>{revoked.push(s.access_token);return true},buildResult:async()=>({status:200})});
 assert.deepEqual(delivered,{ok:true,result:{status:200}});assert.deepEqual(revoked,[]);
});
