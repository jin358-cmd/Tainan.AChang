const test=require('node:test');
const assert=require('node:assert/strict');

process.env.ACHANG_ENVIRONMENT='production';
process.env.EXPECTED_SUPABASE_PROJECT_REF='ctskglmglevronvnkpmm';
process.env.SUPABASE_URL='https://ctskglmglevronvnkpmm.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_only';
process.env.VERCEL_ENV='production';

const L=require('../lib/server');
const request=cookie=>({headers:{cookie}});
const response=()=>{const headers=new Map();return {getHeader:name=>headers.get(name),setHeader:(name,value)=>headers.set(name,value),headers}};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const jwt=exp=>`header.${Buffer.from(JSON.stringify({exp})).toString('base64url')}.signature`;

async function withFetch(handler,run){const original=global.fetch,calls=[];global.fetch=async(url,options)=>{calls.push({url:String(url),options});return handler(String(url),options,calls.length)};try{return await run(calls)}finally{global.fetch=original}}

test('valid access token revokes the local session without refreshing',async()=>{
 await withFetch(async url=>{assert.match(url,/\/auth\/v1\/logout\?scope=local$/);return new Response(null,{status:204})},async calls=>{
  const result=await L.revokeLocalSession(request(`achang_access=${jwt(Math.floor(Date.now()/1000)+3600)}; achang_refresh=current-refresh`),response());
  assert.deepEqual(result,{revoked:true,alreadyInactive:false});assert.equal(calls.length,1);assert.doesNotMatch(calls[0].url,/refresh_token/);assert.doesNotMatch(calls[0].url,/scope=global/);
 });
});

test('expired access refreshes, revokes the rotated local session and may then be cleared',async()=>{
 await withFetch(async url=>url.includes('grant_type=refresh_token')?json({access_token:'fresh-access',refresh_token:'fresh-refresh',expires_in:3600}):new Response(null,{status:204}),async calls=>{
  const result=await L.revokeLocalSession(request(`achang_access=${jwt(1)}; achang_refresh=current-refresh`),response());
  assert.deepEqual(result,{revoked:true,alreadyInactive:false});assert.equal(calls.length,2);assert.match(calls[0].url,/grant_type=refresh_token/);assert.equal(JSON.parse(calls[0].options.body).refresh_token,'current-refresh');assert.equal(calls[1].options.headers.Authorization,'Bearer fresh-access');
 });
});

test('rotated token pair is preserved after logout failure and a retry can succeed',async()=>{
 const res=response();
 await withFetch(async url=>url.includes('grant_type=refresh_token')?json({access_token:'fresh-access',refresh_token:'fresh-refresh',expires_in:3600}):json({error_code:'unexpected_failure'},500),async()=>{
  await assert.rejects(()=>L.revokeLocalSession(request(`achang_access=${jwt(1)}; achang_refresh=current-refresh`),res),error=>error.status===503&&error.appCode==='SESSION_REVOCATION_FAILED');
 });
 const setCookies=res.getHeader('Set-Cookie');assert.equal(setCookies.length,2);assert.match(setCookies[0],/^achang_access=fresh-access;/);assert.match(setCookies[1],/^achang_refresh=fresh-refresh;/);assert.doesNotMatch(setCookies.join('\n'),/Max-Age=0/);
 await withFetch(async url=>{assert.match(url,/logout\?scope=local$/);return new Response(null,{status:204})},async calls=>{
  const result=await L.revokeLocalSession(request('achang_access=fresh-access; achang_refresh=fresh-refresh'),response());assert.equal(result.revoked,true);assert.equal(calls.length,1);
 });
});

test('rotated token pair is preserved when the logout request throws',async()=>{
 const res=response();
 await withFetch(async url=>{if(url.includes('grant_type=refresh_token'))return json({access_token:'fresh-access',refresh_token:'fresh-refresh',expires_in:3600});throw Error('network down')},async()=>{
  await assert.rejects(()=>L.revokeLocalSession(request(`achang_access=${jwt(1)}; achang_refresh=current-refresh`),res),error=>error.status===503);
 });
 assert.match(res.getHeader('Set-Cookie').join('\n'),/achang_refresh=fresh-refresh/);
 await withFetch(async()=>new Response(null,{status:204}),async calls=>{assert.equal((await L.revokeLocalSession(request('achang_access=fresh-access; achang_refresh=fresh-refresh'),response())).revoked,true);assert.equal(calls.length,1)});
});

for(const [name,status,data] of [
 ['generic 400',400,{error:'bad request'}],
 ['generic 401',401,{error:'unauthorized'}],
 ['401 bad_jwt',401,{error_code:'bad_jwt',msg:'invalid JWT'}]
])test(`${name} is not mistaken for a revoked session`,async()=>{
 await withFetch(async()=>json(data,status),async()=>assert.rejects(()=>L.revokeLocalSession(request('achang_access=malformed; achang_refresh=current-refresh'),response()),error=>error.status===503&&error.appCode==='SESSION_REVOCATION_FAILED'));
});

for(const [name,status,data] of [
 ['refresh generic 400',400,{error:'bad request'}],
 ['refresh generic 401',401,{error:'unauthorized'}],
 ['refresh 401 bad_jwt',401,{error_code:'bad_jwt'}]
])test(`${name} is not mistaken for an inactive session`,async()=>{
 await withFetch(async()=>json(data,status),async()=>assert.rejects(()=>L.revokeLocalSession(request('achang_refresh=current-refresh'),response()),error=>error.status===503&&error.appCode==='SESSION_REFRESH_FAILED'));
});

test('only explicit absent-session codes and no-cookie state are classified inactive',async()=>{
 await withFetch(async()=>json({error_code:'session_not_found'},401),async()=>assert.deepEqual(await L.revokeLocalSession(request('achang_access=well-formed-enough'),response()),{revoked:false,alreadyInactive:true,reason:'session_not_found'}));
 await withFetch(async()=>json({error_code:'refresh_token_not_found'},400),async()=>assert.deepEqual(await L.revokeLocalSession(request('achang_refresh=missing'),response()),{revoked:false,alreadyInactive:true,reason:'refresh_token_not_found'}));
 const original=global.fetch;global.fetch=async()=>{throw Error('must not call fetch')};try{assert.deepEqual(await L.revokeLocalSession(request(''),response()),{revoked:false,alreadyInactive:true,reason:'no_session_cookie'})}finally{global.fetch=original}
});

test('malformed successful refresh response fails closed',async()=>{
 await withFetch(async()=>json({access_token:'only-access'}),async()=>assert.rejects(()=>L.revokeLocalSession(request('achang_refresh=current-refresh'),response()),error=>error.status===503&&error.appCode==='SESSION_REFRESH_FAILED'));
});
