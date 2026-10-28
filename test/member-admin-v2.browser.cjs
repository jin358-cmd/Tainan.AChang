'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const people=[
 {id:'22222222-2222-4222-8222-222222222222',name:'合成志工',phone:'+886900000001',address:'合成地址一',resident_area:'成功里',assignment:null,is_leader:false},
 {id:'55555555-5555-4555-8555-555555555555',name:'合成管理員候選',phone:'+886900000002',address:'合成地址二',resident_area:'成功里',assignment:null,is_leader:false}
];

function type(file){return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream'}

async function startServer(){
 const observed={calls:[],external:[],consoleErrors:[],pageErrors:[]},accounts=[];
 const instance=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');response.setHeader('Cache-Control','no-store');
  if(url.pathname.startsWith('/api/')){
   const endpoint=url.pathname.slice(5);let raw='';request.on('data',chunk=>raw+=chunk);request.on('end',()=>{
    const body=raw?JSON.parse(raw):null;observed.calls.push({method:request.method,endpoint,body,device:request.headers['x-achang-device']||''});response.setHeader('Content-Type','application/json');
    if(endpoint==='config')return response.end(JSON.stringify({environment:'test',projectRef:'fhxdpupascsikjsycpbi',supabaseUrl:'https://fhxdpupascsikjsycpbi.supabase.co',googleOAuthUrl:'https://fhxdpupascsikjsycpbi.supabase.co/auth/v1/authorize?provider=google'}));
    if(endpoint==='session'&&request.method==='GET')return response.end(JSON.stringify({role:'admin',memberId:null,accountId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',displayName:'合成管理員'}));
    if(endpoint==='tasks')return response.end(JSON.stringify({tasks:[]}));
    if(endpoint==='roster')return response.end(JSON.stringify({people}));
    if(endpoint==='member-admin-v2'&&request.method==='GET')return response.end(JSON.stringify({ok:true,members:accounts,devices:[]}));
    if(endpoint==='member-admin-v2'&&request.method==='POST'){
     const person=people.find(item=>item.id===body.memberId);accounts.push({id:crypto.randomUUID(),member_id:body.memberId,name:person.name,phone:person.phone,role:body.role,status:'pending',enabled:false,protected:false});response.statusCode=201;return response.end(JSON.stringify({ok:true}));
    }
    if(endpoint==='member-admin-v2'&&request.method==='PATCH'){
     const account=accounts.find(item=>item.id===body.accountId);if(!account){response.statusCode=404;return response.end(JSON.stringify({error:'missing synthetic account'}))}account.status=body.action==='approve'?'active':body.action==='suspend'?'suspended':'active';account.enabled=account.status==='active';return response.end(JSON.stringify({ok:true}));
    }
    response.end(JSON.stringify({ok:true}));
   });return;
  }
  const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));if(relative.includes('..')){response.statusCode=400;return response.end('bad path')}
  try{response.setHeader('Content-Type',type(relative));response.end(fs.readFileSync(path.join(root,relative)))}catch{response.statusCode=404;response.end('not found')}
 });
 await new Promise((resolve,reject)=>{instance.once('error',reject);instance.listen(0,'127.0.0.1',resolve)});
 return {instance,origin:`http://127.0.0.1:${instance.address().port}`,observed,accounts};
}

(async()=>{
 const local=await startServer(),browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===local.origin)return route.continue();local.observed.external.push(url.href.replace(/[?#].*$/,''));return route.abort('blockedbyclient')});
  const page=await context.newPage();page.on('console',message=>{if(message.type()==='error')local.observed.consoleErrors.push(message.text())});page.on('pageerror',error=>local.observed.pageErrors.push(error.message));
  await page.goto(local.origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#signedInName')?.textContent==='合成管理員');
  assert.equal(await page.locator('#mapLibre').count(),1);assert.equal(await page.locator('.desktop-nav [data-page="planner"]').count(),1);assert.equal(await page.locator('.desktop-nav [data-page="reports"]').count(),1);
  await page.locator('#adminHeaderAction').click();await page.waitForSelector('#memberAdminForm');
  await page.locator('#memberAdminForm input[name="password"]').fill('123456');await page.locator('#memberAdminForm').evaluate(form=>form.requestSubmit());
  await page.waitForSelector('[data-member-action="approve"]');page.once('dialog',dialog=>dialog.accept());await page.locator('[data-member-action="approve"]').click();await page.waitForSelector('.auth-success-check');
  await page.locator('#newAccountRole').selectOption('admin');await page.locator('#authorizationVolunteer').selectOption(people[1].id);await page.locator('#memberAdminForm input[name="password"]').fill('654321');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#memberAdminForm').evaluate(form=>form.requestSubmit());await page.waitForFunction(()=>document.querySelectorAll('[data-member-action="approve"]').length===1);
  const creates=local.observed.calls.filter(call=>call.endpoint==='member-admin-v2'&&call.method==='POST');assert.deepEqual(creates.map(call=>({memberId:call.body.memberId,phone:call.body.phone,pin:call.body.pin,role:call.body.role})),[
   {memberId:people[0].id,phone:'0900-000-001',pin:'123456',role:'volunteer'},
   {memberId:people[1].id,phone:'0900-000-002',pin:'654321',role:'admin'}
  ]);
  assert.equal(creates.some(call=>'deviceId' in call.body||'deviceProof' in call.body),false);assert.equal(local.observed.calls.some(call=>call.endpoint==='members'&&['POST','PATCH'].includes(call.method)),false);
  assert.equal(local.accounts[0].status,'active');assert.equal(local.accounts[1].status,'pending');assert.deepEqual(local.observed.pageErrors,[]);assert.deepEqual(local.observed.consoleErrors.filter(message=>!/net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message)),[]);
  process.stdout.write(JSON.stringify({status:'PASS',cases:['create pending volunteer','approve volunteer','create pending admin','map/tasks/schedule controls preserved'],requests:local.observed.calls.map(call=>`${call.method} ${call.endpoint}`),externalRequestsBlocked:local.observed.external.length},null,2)+'\n');
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>local.instance.close(resolve))}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
