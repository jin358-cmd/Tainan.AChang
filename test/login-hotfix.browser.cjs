'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');

function contentType(file) {
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream';
}

async function startServer(options = {}) {
  const observed = {api:[],external:[],consoleErrors:[],pageErrors:[]};
  const state = {loggedIn:false,role:options.role || 'admin',selectionPosts:0,logoutDeletes:0};
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname.startsWith('/api/')) {
      const endpoint = url.pathname.slice(5);
      let payload={};
      if (!['GET','HEAD'].includes(request.method)) {
        let raw='';for await(const chunk of request)raw+=chunk;
        try{payload=raw?JSON.parse(raw):{}}catch{}
      }
      observed.api.push(`${request.method} ${endpoint}`);
      response.setHeader('Content-Type', 'application/json');
      if (endpoint === 'config' && request.method === 'GET') {
        response.end(JSON.stringify({environment:'test',projectRef:'fhxdpupascsikjsycpbi',supabaseUrl:'https://fhxdpupascsikjsycpbi.supabase.co',googleOAuthUrl:'https://fhxdpupascsikjsycpbi.supabase.co/auth/v1/authorize?provider=google&redirect_to='}));
      } else if (endpoint === 'oauth-session' && request.method === 'POST') {
        if (options.oauthFailure) {
          response.statusCode = options.oauthFailure;
          response.end(JSON.stringify({error:'合成帳號尚未授權'}));
        } else {
          state.loggedIn = true;
          response.end(JSON.stringify({ok:true}));
        }
      } else if (endpoint === 'session' && request.method === 'POST') {
        if(options.identitySelection&&!payload.selectionToken){
          response.end(JSON.stringify({authorization:'identity_selection_required',identities:[{token:'opaque-token-admin',label:'測•••員',role:'管理員'},{token:'opaque-token-volunteer',label:'測•••甲',role:'志工'}]}));
          return;
        }
        if(options.identitySelection&&payload.selectionToken&&options.selectionDelays){const index=state.selectionPosts++,delay=options.selectionDelays[Math.min(index,options.selectionDelays.length-1)];await new Promise(resolve=>setTimeout(resolve,delay));if(index<(options.selectionFailures||0)){response.statusCode=503;response.end(JSON.stringify({error:'合成登入清理失敗'}));return}}
        state.loggedIn = true;
        if (options.secondDevice) {
          response.statusCode = 202;
          response.end(JSON.stringify({authorization:'device_application_required',message:'此裝置尚未授權，可提出申請'}));
        } else response.end(JSON.stringify({ok:true}));
      } else if (endpoint === 'device-application' && request.method === 'POST') {
        response.statusCode = 202;
        response.end(JSON.stringify({authorization:'device_pending',message:'裝置授權申請已送出，請等待管理員核准'}));
      } else if (endpoint === 'session' && request.method === 'DELETE') {
        state.logoutDeletes++;
        if(state.logoutDeletes<=(options.logoutFailures||0)){response.statusCode=503;response.end(JSON.stringify({error:'合成登出失敗'}));return}
        state.loggedIn = false;
        response.end(JSON.stringify({ok:true}));
      } else if (endpoint === 'session' && request.method === 'GET') {
        if (!state.loggedIn) {
          response.statusCode = 401;
          response.end(JSON.stringify({error:'合成工作階段不存在'}));
        } else {
          response.end(JSON.stringify({role:state.role,memberId:state.role === 'volunteer' ? 'synthetic-member' : null,accountId:'synthetic-account',displayName:state.role === 'volunteer' ? '合成志工' : '合成管理員'}));
        }
      } else if (endpoint === 'tasks') response.end(JSON.stringify({tasks:[]}));
      else if (endpoint === 'roster') response.end(JSON.stringify({people:[]}));
      else response.end(JSON.stringify({ok:true}));
      return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (relative.includes('..')) { response.statusCode=400; response.end('bad path'); return; }
    if (options.failPublicData && relative === 'data-public.json') {
      response.statusCode = 500;
      response.end('synthetic failure');
      return;
    }
    try {
      response.setHeader('Content-Type', contentType(relative));
      response.end(fs.readFileSync(path.join(root, relative)));
    } catch {
      response.statusCode=404;
      response.end('not found');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  return {server,origin:`http://127.0.0.1:${server.address().port}`,observed,state};
}

async function withPage(options, run) {
  const local = await startServer(options);
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  try {
    const context = await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === local.origin) return route.continue();
      local.observed.external.push(url.href.replace(/[?#].*$/,''));
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('console', message => { if (message.type()==='error') local.observed.consoleErrors.push(message.text()); });
    page.on('pageerror', error => local.observed.pageErrors.push(error.message));
    await run({page,context,...local});
    await context.close();
    return local.observed;
  } finally {
    await browser.close();
    await new Promise(resolve=>local.server.close(resolve));
  }
}

async function callbackCase(role) {
  return withPage({role}, async ({page,origin,observed}) => {
    const access = 'synthetic_access_' + 'a'.repeat(32);
    const refresh = 'synthetic_refresh_' + 'b'.repeat(24);
    await page.goto(`${origin}/#access_token=${access}&refresh_token=${refresh}&token_type=bearer`, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#signedInName')?.hidden === false);
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(observed.api.filter(x=>x==='POST oauth-session').length, 1);
    assert.equal(observed.api.filter(x=>x==='GET session').length, 1);
    assert.equal(await page.locator('#secureLogin').getAttribute('hidden') !== null, true);
    assert.equal(await page.locator('#secureLogout').getAttribute('hidden') !== null, false);
    assert.equal(await page.locator('#signedInName').textContent(), role === 'admin' ? '合成管理員' : '合成志工');
    assert.equal(await page.locator('#mapLibre').count(), 1);
    assert.equal(await page.locator('#areaPopup').count(), 1);
    const areasHidden = await page.locator('.bottom-nav [data-page="areas"]').getAttribute('hidden') !== null;
    const plannerHidden = await page.locator('.bottom-nav [data-page="planner"]').getAttribute('hidden') !== null;
    assert.equal(areasHidden, role === 'volunteer');
    assert.equal(plannerHidden, role === 'volunteer');
  });
}

async function oauthFailureCase() {
  return withPage({oauthFailure:403}, async ({page,origin,observed}) => {
    await page.goto(`${origin}/#access_token=synthetic_access&refresh_token=synthetic_refresh`, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => !document.querySelector('#secureLogin')?.hidden);
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(observed.api.filter(x=>x==='POST oauth-session').length, 1);
    assert.match(await page.locator('#authStatus').textContent(), /帳號尚未授權或裝置待核准/);
  });
}

async function passwordLogoutReopenCase() {
  return withPage({role:'admin'}, async ({page,origin,observed}) => {
    await page.goto(origin, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#volunteerLoginBtn')?.hidden === false);
    await page.locator('#volunteerLoginBtn').click();
    await page.waitForFunction(() => !document.querySelector('#secureLogin')?.hidden);
    await page.locator('#secureLoginForm input[name="login"]').fill('synthetic-admin@example.invalid');
    await page.locator('#secureLoginForm input[name="password"]').fill('synthetic-password');
    await page.locator('#secureLoginForm button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#signedInName')?.hidden === false);
    assert.equal(await page.locator('#signedInName').textContent(), '合成管理員');
    await page.locator('#secureLogout').click();
    await page.waitForFunction(() => document.querySelector('#secureLogout')?.hidden === true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#volunteerLoginBtn')?.hidden === false);
    await page.locator('#volunteerLoginBtn').click();
    await page.waitForFunction(() => !document.querySelector('#secureLogin')?.hidden);
    assert.ok(observed.api.includes('POST session'));
    assert.ok(observed.api.includes('DELETE session'));
    assert.ok(observed.api.filter(x=>x==='GET session').length >= 2);
  });
}

async function logoutFailureCase(){
 return withPage({role:'admin',logoutFailures:1},async({page,origin,observed})=>{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#volunteerLoginBtn')?.hidden===false);await page.locator('#volunteerLoginBtn').click();
  await page.locator('#secureLoginForm input[name="login"]').fill('synthetic-admin@example.invalid');await page.locator('#secureLoginForm input[name="password"]').fill('synthetic-password');await page.locator('#secureLoginForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);await page.locator('#secureLogout').click();await page.waitForFunction(()=>/登出未完成：合成登出失敗/.test(document.querySelector('#toast')?.textContent||''));
  assert.equal(await page.locator('#signedInName').isVisible(),true);assert.equal(await page.locator('#secureLogout').isVisible(),true);assert.equal(observed.api.filter(x=>x==='DELETE session').length,1);
  await page.locator('#secureLogout').click();await page.waitForFunction(()=>document.querySelector('#secureLogout')?.hidden===true);assert.equal(observed.api.filter(x=>x==='DELETE session').length,2);
 });
}

async function deviceCancelCleanupFailureCase(){
 return withPage({role:'volunteer',secondDevice:true,logoutFailures:1},async({page,origin,observed})=>{
  page.on('dialog',dialog=>dialog.dismiss());await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#volunteerLoginBtn')?.hidden===false);await page.locator('#volunteerLoginBtn').click();
  await page.locator('#secureLoginForm input[name="login"]').fill('0912345678');await page.locator('#secureLoginForm input[name="password"]').fill('123456');await page.locator('#secureLoginForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#authStatus')?.textContent==='合成登出失敗');assert.doesNotMatch(await page.locator('#authStatus').textContent(),/暫存已清除/);assert.equal(observed.api.includes('POST device-application'),false);
 });
}

async function secondDeviceApplicationCase(role='volunteer') {
  return withPage({role,secondDevice:true}, async ({page,origin,observed}) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#volunteerLoginBtn')?.hidden === false);
    await page.locator('#volunteerLoginBtn').click();
    await page.locator('#secureLoginForm input[name="login"]').fill('0912345678');
    await page.locator('#secureLoginForm input[name="password"]').fill('123456');
    await page.locator('#secureLoginForm button[type="submit"]').click();
    await page.waitForFunction(() => /申請已送出/.test(document.querySelector('#authStatus')?.textContent||''));
    assert.ok(observed.api.includes('POST session'));
    assert.ok(observed.api.includes('POST device-application'));
    assert.equal(observed.api.includes('GET tasks'), false);
  });
}

async function sharedPhoneIdentitySelectionCase(){
 return withPage({role:'volunteer',identitySelection:true,selectionDelays:[80,80],selectionFailures:1},async({page,origin,observed})=>{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#volunteerLoginBtn')?.hidden===false);
  await page.locator('#volunteerLoginBtn').click();
  const form=page.locator('#secureLoginForm'),login=form.locator('[name="login"]'),pin=form.locator('[name="password"]');
  await login.fill('0903225788');await pin.fill('123456');await form.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-login-identity]').length===2);
  assert.equal(await login.inputValue(),'0903225788');assert.equal(await login.getAttribute('readonly'),'');assert.equal(await pin.inputValue(),'123456');
  assert.match(await page.locator('#loginIdentityChoices').textContent(),/測•••員/);
  await page.locator('[data-login-identity-cancel]').click();
  assert.equal(await pin.inputValue(),'');assert.equal(await login.getAttribute('readonly'),null);assert.equal(await page.locator('#loginIdentityChoices').isHidden(),true);
  await pin.fill('123456');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-login-identity]').length===2);
  await page.locator('[data-login-identity]').first().click();
  assert.equal(await page.locator('[data-login-identity-cancel]').isDisabled(),true);assert.equal(await page.locator('[data-login-identity]').first().isDisabled(),true);
  await page.locator('[data-login-identity-cancel]').evaluate(node=>node.click());await page.locator('[data-login-identity]').first().evaluate(node=>node.click());await form.evaluate(node=>node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await page.waitForFunction(()=>document.querySelector('#authStatus')?.textContent==='合成登入清理失敗');
  assert.equal(await form.locator('button[type="submit"]').isEnabled(),true);assert.equal(await page.locator('#signedInName').isHidden(),true);
  await pin.fill('123456');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-login-identity]').length===2);
  await page.locator('[data-login-identity]').first().click();await page.waitForTimeout(20);
  assert.equal(await form.locator('button[type="submit"]').isDisabled(),true);assert.equal(await page.locator('#signedInName').isHidden(),true);
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  assert.equal(observed.api.filter(x=>x==='POST session').length,5);
 });
}

async function bootFailureCase() {
  return withPage({failPublicData:true}, async ({page,origin}) => {
    await page.goto(origin, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => !document.querySelector('#secureLogin')?.hidden);
    assert.equal(await page.locator('#authStatus').textContent(), '網站暫時無法完成登入，請重新整理後再試');
  });
}

async function mapFallbackCase() {
  return withPage({role:'admin'}, async ({page,origin,observed}) => {
    await page.goto(`${origin}/#access_token=synthetic_access&refresh_token=synthetic_refresh`, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#signedInName')?.hidden === false);
    await page.locator('.desktop-nav [data-page="map"]').click();
    await page.waitForFunction(() => !document.querySelector('#mapFallback')?.hidden);
    assert.match(await page.locator('#mapFallback').textContent(), /互動地圖/);
    assert.ok(observed.external.some(url=>url.startsWith('https://cdn.jsdelivr.net/npm/maplibre-gl@')));
    assert.equal(observed.external.some(url=>url.includes('supabase.co')), false);
  });
}

async function memberApplicationModalCase() {
  return withPage({role:'volunteer'}, async ({page,origin,observed}) => {
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#volunteerLoginBtn')?.hidden === false);
    await page.locator('#volunteerLoginBtn').click();
    await page.waitForFunction(() => document.querySelector('#secureLogin')?.hidden === false);
    assert.equal(await page.locator('#closeSecureLogin').count(),0);
    assert.equal(await page.locator('#openMemberApplication').count(),1);
    assert.equal(await page.locator('#secureLoginForm input[name="login"]').getAttribute('placeholder'),'09xx-xxx-xxx');
    await page.locator('#openMemberApplication').click();
    await page.locator('#memberApplicationForm').waitFor();
    assert.equal(await page.evaluate(()=>{const form=document.querySelector('#memberApplicationForm'),rect=form.getBoundingClientRect(),top=document.elementFromPoint(rect.left+rect.width/2,rect.top+Math.min(30,rect.height/2));return !!top?.closest('#memberApplicationForm')}),true);
    assert.equal(await page.locator('#memberApplicationForm input[name="invitationCode"]').getAttribute('maxlength'),'4');
    assert.equal(await page.locator('#memberApplicationForm input[name="invitationCode"]').getAttribute('pattern'),'[0-9]{4}');
    assert.equal(await page.locator('#previewDemoLogin').count(),0);
    return {modal:'PASS',invitationDigits:4,previewBypass:false,external:observed.external};
  });
}

async function adminNavigationSmokeCase() {
 return withPage({role:'admin'},async({page,origin,observed})=>{
   await page.goto(origin+'/#access_token=synthetic_access&refresh_token=synthetic_refresh',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
   const visited=[];
   for(const name of ['map','areas','planner','reports','people']){
     await page.locator('.desktop-nav [data-page="'+name+'"]').click();
     await page.waitForFunction(n=>document.querySelector('#page-'+n)?.classList.contains('active'),name);
     visited.push(name);
   }
   assert.equal(visited.length,5);
   assert.equal(await page.locator('#previewDemoLogin').count(),0);
   await page.locator('#openRosterAuthorization').click();
   await page.locator('#memberAdminForm').waitFor();
   assert.match(await page.locator('#modalTitle').textContent(),/會員授權/);
   await page.locator('#closeModal').click();
   await page.locator('#addMember').click();
   await page.locator('#newMemberForm').waitFor();
   await page.locator('#closeModal').click();
   return {pages:visited,api:observed.api,consoleErrors:observed.consoleErrors,pageErrors:observed.pageErrors,external:observed.external};
 });
}
(async()=>{
  const results = {
    status:'PASS',
    network:'local synthetic API only; every external request blocked',
    adminCallback:await callbackCase('admin'),
    volunteerCallback:await callbackCase('volunteer'),
    unauthorizedCallback:await oauthFailureCase(),
    passwordLogoutReopen:await passwordLogoutReopenCase(),
    logoutFailure:await logoutFailureCase(),
    deviceCancelCleanupFailure:await deviceCancelCleanupFailureCase(),
    secondDeviceApplication:await secondDeviceApplicationCase('volunteer'),
    adminDeviceApplication:await secondDeviceApplicationCase('admin'),
    sharedPhoneIdentitySelection:await sharedPhoneIdentitySelectionCase(),
    visibleBootFailure:await bootFailureCase(),
    latestUiMapFallback:await mapFallbackCase(),
    memberApplicationModal:await memberApplicationModalCase(),
    adminNavigationSmoke:await adminNavigationSmokeCase(),
  };
  const expectedConsoleError = {
    adminCallback: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    volunteerCallback: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    unauthorizedCallback: message => /403 \(Forbidden\)$/.test(message),
    passwordLogoutReopen: message => /401 \(Unauthorized\)$/.test(message),
    logoutFailure: message => /(?:401 \(Unauthorized\)|503 \(Service Unavailable\))$/.test(message),
    deviceCancelCleanupFailure: message => /(?:401 \(Unauthorized\)|503 \(Service Unavailable\))$/.test(message),
    secondDeviceApplication: message => /401 \(Unauthorized\)$/.test(message),
    adminDeviceApplication: message => /401 \(Unauthorized\)$/.test(message),
    sharedPhoneIdentitySelection: message => /(?:401 \(Unauthorized\)|503 \(Service Unavailable\))$/.test(message),
    visibleBootFailure: message => /500 \(Internal Server Error\)$/.test(message) || /^Error: 地圖資料無法讀取\n/.test(message),
    latestUiMapFallback: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    memberApplicationModal: message => /401 \(Unauthorized\)$/.test(message),
    adminNavigationSmoke: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
  };
  for (const [name,result] of Object.entries(results)) {
    if (!result || typeof result !== 'object') continue;
    assert.deepEqual(result.pageErrors, [], `${name} had page errors`);
    const unexpected = result.consoleErrors.filter(message => !expectedConsoleError[name]?.(message));
    assert.deepEqual(unexpected, [], `${name} had unexpected console errors`);
  }
  process.stdout.write(JSON.stringify(results,null,2)+'\n');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
