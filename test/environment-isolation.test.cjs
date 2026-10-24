const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readEnvironment,PROJECTS}=require('../lib/environment');

const valid={
 ACHANG_ENVIRONMENT:'test',
 ACHANG_TEST_ISOLATED:'1',
 EXPECTED_SUPABASE_PROJECT_REF:PROJECTS.test,
 SUPABASE_URL:`https://${PROJECTS.test}.supabase.co`,
 SUPABASE_PUBLISHABLE_KEY:'public-test-key',
 VERCEL_ENV:'preview'
};

test('test preview accepts only a complete matching test identity',()=>{
 assert.equal(readEnvironment(valid).valid,true);
});

test('missing Supabase URL fails closed',()=>{
 const env={...valid};delete env.SUPABASE_URL;
 assert.deepEqual(readEnvironment(env).errors,['SUPABASE_URL_MISSING']);
});

test('URL and expected project mismatch fails closed',()=>{
 const env={...valid,SUPABASE_URL:`https://${PROJECTS.production}.supabase.co`};
 assert.equal(readEnvironment(env).valid,false);
 assert.ok(readEnvironment(env).errors.includes('PROJECT_REF_URL_MISMATCH'));
});

test('test preview refuses Production project identity',()=>{
 const env={...valid,EXPECTED_SUPABASE_PROJECT_REF:PROJECTS.production,SUPABASE_URL:`https://${PROJECTS.production}.supabase.co`};
 assert.equal(readEnvironment(env).valid,false);
 assert.ok(readEnvironment(env).errors.includes('PROJECT_REF_ENVIRONMENT_MISMATCH'));
});

test('service-role or secret key cannot be used as the browser/server publishable key',()=>{
 const secret={...valid,SUPABASE_PUBLISHABLE_KEY:'sb_secret_must_never_be_accepted'};
 assert.ok(readEnvironment(secret).errors.includes('SUPABASE_PUBLISHABLE_KEY_INVALID'));
 const legacy={...valid,SUPABASE_PUBLISHABLE_KEY:'service_role.jwt.must.not.be.accepted'};
 assert.ok(readEnvironment(legacy).errors.includes('SUPABASE_PUBLISHABLE_KEY_INVALID'));
});

test('test identity refuses Vercel Production target and missing isolation flag',()=>{
 const env={...valid,VERCEL_ENV:'production',ACHANG_TEST_ISOLATED:'0'};
 assert.ok(readEnvironment(env).errors.includes('TEST_ISOLATION_FLAG_MISSING'));
 assert.ok(readEnvironment(env).errors.includes('TEST_MUST_NOT_USE_VERCEL_PRODUCTION'));
});

test('browser and Edge source contain no Production project fallback or secret key',()=>{
 const files=['app.js','lib/server.js','api/config.js','supabase/functions/achang-pin-login/index.ts','supabase/functions/achang-member-apply/index.ts','supabase/functions/achang-admin-provision/index.ts'];
 const source=files.map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');
 assert.doesNotMatch(source,/ctskglmglevronvnkpmm/);
 assert.doesNotMatch(source,/sb_(?:secret|publishable)_/);
 assert.match(source,/ACHANG_EXPECTED_PROJECT_REF/);
});
