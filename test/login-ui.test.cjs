'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('login screen omits the top-right return action while preserving login controls',()=>{
 const html=read('index.html'),app=read('app.js');
 assert.doesNotMatch(html,/id="closeSecureLogin"/);
 assert.match(html,/id="secureLoginForm"/);assert.match(html,/id="googleOAuthLogin"/);assert.match(html,/登入並檢視工作/);
 assert.match(app,/const closeSecureLogin=\$\('#closeSecureLogin'\);if\(closeSecureLogin\)/);
});
