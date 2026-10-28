const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readEnvironment,TEST_PROJECT_REF}=require('../lib/environment');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const valid={ACHANG_ENVIRONMENT:'test',ACHANG_TEST_ISOLATED:'1',EXPECTED_SUPABASE_PROJECT_REF:TEST_PROJECT_REF,SUPABASE_URL:`https://${TEST_PROJECT_REF}.supabase.co`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_only',VERCEL_ENV:'preview'};

test('I01 Preview without TEST variables fails closed',()=>assert.equal(readEnvironment({VERCEL_ENV:'preview'}).valid,false));
test('I02 Preview refuses the Production Supabase project',()=>assert.equal(readEnvironment({...valid,EXPECTED_SUPABASE_PROJECT_REF:'ctskglmglevronvnkpmm',SUPABASE_URL:'https://ctskglmglevronvnkpmm.supabase.co'}).valid,false));
test('I03 only the isolated TEST project is accepted',()=>assert.equal(readEnvironment(valid).valid,true));
test('I04 runtime files contain no Production Supabase or Production-site redirect',()=>{
 const runtime=['app.js','lib/server.js','api/config.js'].map(read).join('\n');
 assert.doesNotMatch(runtime,/ctskglmglevronvnkpmm|tainan-achang-online\.vercel\.app|achang\.pmos\.space/);
 assert.doesNotMatch(runtime,/Domain=/);
});
test('I05 Google OAuth is loaded from validated runtime TEST configuration',()=>{
 const app=read('app.js');
 assert.match(app,/await loadRuntimeConfig\(\)/);
 assert.match(app,/runtimeConfig\.googleOAuthUrl/);
 assert.doesNotMatch(app,/const GOOGLE_AUTH_URL/);
});
test('I06 fixed UI preview host is isolated from runtime APIs',()=>{
 const app=read('app.js');
 assert.match(app,/READONLY_PREVIEW_HOST='tainan-achang-online-git-fix-achang-day-routes-memb-4e2e73-tjc1\.vercel\.app'/);
 assert.match(app,/if\(previewOnly\(\)\)throw Object\.assign\(new Error\('唯讀 UI 預覽不連線 API'\)/);
 assert.match(app,/if\(!previewOnly\(\)\)await loadRuntimeConfig\(\)/);
});
test('I07 UI preview disables real authentication and write controls',()=>{
 const app=read('app.js');
 assert.match(app,/anchor\.hidden=true;anchor\.style\.display='none'/);
 assert.match(app,/google\.hidden=true;google\.style\.display='none'/);
 assert.match(app,/done\|\|future\|\|readOnly\?'disabled'/);
 assert.match(app,/menu\.disabled=true/);
});
