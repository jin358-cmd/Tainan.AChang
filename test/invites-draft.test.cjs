'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('invite API is fail-closed until Owner enables the backend',async()=>{
 delete process.env.INVITES_ENABLED;
 const handler=require('../api/invites');
 let body='',headers={};
 const req={method:'GET',headers:{},body:undefined};
 const res={statusCode:0,writableEnded:false,setHeader(k,v){headers[k]=v},getHeader(k){return headers[k]},end(v){body=String(v);this.writableEnded=true}};
 await handler(req,res);
 assert.equal(res.statusCode,503);
 assert.match(body,/尚未經 Owner 核准啟用/);
});

test('migration draft stores only hashes and grants no direct client table access',()=>{
 const sql=read('backend/005_invites_owner_approval_required.sql');
 assert.match(sql,/token_hash text not null unique/);
 assert.doesNotMatch(sql,/\btoken\s+text\b/);
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/revoke all on public\.member_invites, public\.membership_applications from public, anon, authenticated/);
 assert.match(sql,/grant execute on function app_private\.consume_member_invite\(text,text,text\) to service_role/);
 assert.match(sql,/for update/);
 assert.match(sql,/used_at=now\(\)/);
});

test('QR and LINE UI are explicitly synthetic while formal invite creation is disabled',()=>{
 const html=read('index.html'),app=read('app.js');
 assert.match(html,/id="createInvite"[^>]+disabled/);
 assert.match(html,/qrcodejs@1\.0\.0/);
 assert.match(app,/SYNTHETIC-NOT-A-CREDENTIAL/);
 assert.match(app,/https:\/\/line\.me\/R\/msg\/text\//);
});
