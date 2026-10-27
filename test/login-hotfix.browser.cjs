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
  const state = {loggedIn:!!options.initiallyLoggedIn,role:options.role || 'admin',selectionPosts:0,logoutDeletes:0,roster:(options.roster||[]).map(person=>({...person}))};
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
      } else if (endpoint === 'tasks') {if(request.method==='PATCH'&&options.taskPatchDelay)await new Promise(resolve=>setTimeout(resolve,options.taskPatchDelay));response.end(JSON.stringify(request.method==='GET'?{tasks:options.tasks||[],groupContacts:options.groupContacts||[]}:{ok:true}));}
      else if (endpoint === 'roster') {
        if(request.method==='PATCH'){
          const person=state.roster.find(item=>item.id===payload.id);
          if(person){
            if('assignment' in payload)person.assignment=payload.assignment||'';
            if('isLeader' in payload)person.is_leader=!!payload.isLeader;
          }
          response.end(JSON.stringify({ok:true}));
        } else response.end(JSON.stringify({people:state.roster}));
      }
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
      let body=fs.readFileSync(path.join(root, relative));
      if(options.exposeAppTestHooks&&relative==='app.js')body=Buffer.from(body.toString().replace('boot();\n})();',`window.__appTestHooks={visibleShiftStops,openShiftStopPopup,openAreaPreview,prepareAdminPinnedMap(){const r=data.stops[0],key=stopKey(r);state.pins={[key]:{lon:120.24,lat:23.005}};layerState.day=r['時段']==='日間';layerState.night=r['時段']==='夜間';page='map';mapFailed=false;mapLoaded=true;map={getLayer:()=>true,setPaintProperty(){}};updateMap();return {area:r['里別'],shift:r['時段'],address:r['停靠點原文'],remaining:data.stops.filter(x=>x['里別']===r['里別']&&x['時段']===r['時段']&&!state.pins[stopKey(x)]).length}}};\nboot();\n})();`));
      response.end(body);
    } catch {
      response.statusCode=404;
      response.end('not found');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const host=options.previewHost?'tainan-achang-pin-eipp-test-localhost.localhost':'127.0.0.1';
  return {server,origin:`http://${host}:${server.address().port}`,observed,state};
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
    assert.equal(await page.locator('body').evaluate((node)=>node.classList.contains('volunteer-session')),role==='volunteer');
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
    assert.equal(await page.locator('body').evaluate((node)=>node.classList.contains('volunteer-session')),false);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#volunteerLoginBtn')?.hidden === false);
    await page.locator('#volunteerLoginBtn').click();
    await page.waitForFunction(() => !document.querySelector('#secureLogin')?.hidden);
    assert.ok(observed.api.includes('POST session'));
    assert.ok(observed.api.includes('DELETE session'));
    assert.ok(observed.api.filter(x=>x==='GET session').length >= 2);
  });
}

async function previewSavedSessionReloadCase(){
 return withPage({role:'volunteer',initiallyLoggedIn:true,previewHost:true},async({page,context,origin,observed})=>{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  assert.equal(await page.locator('#signedInName').textContent(),'合成志工');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  const second=await context.newPage();await second.goto(origin,{waitUntil:'domcontentloaded'});
  await second.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  assert.equal(await second.locator('#signedInName').textContent(),'合成志工');await second.close();
  assert.ok(observed.api.filter(x=>x==='GET session').length>=3);
 });
}

async function volunteerTaskExpansionAndResetCase(){
 const day=new Date().toISOString().slice(0,10);
 const tasks=[
  {id:'synthetic-task-1',volunteer_id:'synthetic-member',visit_date:day,shift:'夜間',area:'成功里',truck:'KEB-5939',stop_address:'中山南路1號',eta:'00:00',stop_order:1,status:'待訪'},
  {id:'synthetic-task-2',volunteer_id:'synthetic-member',visit_date:day,shift:'夜間',area:'成功里',truck:'KEB-5939',stop_address:'中山南路2號',eta:'00:05',stop_order:2,status:'待訪'},
  {id:'synthetic-task-3',volunteer_id:'synthetic-member',visit_date:day,shift:'日間',area:'成功里',truck:'OTHER-1',stop_address:'中山南路1號',eta:'10:30',stop_order:1,status:'待訪'},
  {id:'synthetic-task-4',volunteer_id:'synthetic-member',visit_date:day,shift:'日間',area:'成功里',truck:'OTHER-1',stop_address:'自訂集合點',eta:'10:45',stop_order:2,status:'待訪'}
 ];
 const groupContacts=[
  {visit_date:day,shift:'夜間',area:'成功里',truck:'KEB-5939',name:'合成志工',phone:'+886989098468'},
  {visit_date:day,shift:'夜間',area:'成功里',truck:'KEB-5939',name:'同組志工',phone:'+886903225788'},
  {visit_date:day,shift:'日間',area:'成功里',truck:'KEB-5939',name:'跨班志工',phone:'+886911111111'},
  {visit_date:day,shift:'夜間',area:'成功里',truck:'OTHER-1',name:'跨車志工',phone:'+886922222222'},
  {visit_date:day,shift:'日間',area:'成功里',truck:'OTHER-1',name:'日間本人',phone:'+886933333333'},
  {visit_date:day,shift:'日間',area:'成功里',truck:'OTHER-1',name:'日間同組',phone:'+886944444444'}
 ];
 return withPage({role:'volunteer',initiallyLoggedIn:true,previewHost:true,tasks,groupContacts,taskPatchDelay:120,exposeAppTestHooks:true},async({page,origin,observed})=>{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  const expander=page.locator('[data-vol-expand]').first();
  await expander.waitFor();
  assert.equal(await expander.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.volunteer-stop-panel').first().isHidden(),true);
  await expander.click();
  assert.equal(await page.locator('[data-vol-expand]').first().getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.volunteer-stop-panel').first().isVisible(),true);
  assert.equal(await page.locator('.volunteer-stop-panel:not([hidden]) .volunteer-stop-item').count(),2);
  await page.locator('[data-vol-group]').first().click();
  assert.match(await page.locator('#areaPopup').textContent(),/已授權 2 人/);
  assert.match(await page.locator('#areaPopup').textContent(),/合成志工/);
  assert.match(await page.locator('#areaPopup').textContent(),/同組志工/);
  assert.match(await page.locator('#areaPopup').textContent(),/0989-098-468/);
  assert.equal(await page.locator('#areaPopup a[href^="tel:"]').count(),2);
  assert.doesNotMatch(await page.locator('#areaPopup').textContent(),/跨班志工/);
  assert.doesNotMatch(await page.locator('#areaPopup').textContent(),/跨車志工/);
  await page.locator('[data-close-area]').click();
  await page.evaluate(()=>window.__appTestHooks.openAreaPreview('成功里'));
  const scopedMapRoster=await page.locator('#areaPopup').textContent();
  assert.match(scopedMapRoster,/合成志工/);
  assert.match(scopedMapRoster,/同組志工/);
  assert.match(scopedMapRoster,/日間本人/);
  assert.match(scopedMapRoster,/日間同組/);
  assert.doesNotMatch(scopedMapRoster,/跨班志工|跨車志工/);
  assert.equal(await page.locator('#areaPopup .popup-group-section').count(),2);
  const nightGroup=page.locator(`#areaPopup [data-popup-group="${day}|夜間|KEB-5939|成功里"]`),dayGroup=page.locator(`#areaPopup [data-popup-group="${day}|日間|OTHER-1|成功里"]`);
  assert.match(await nightGroup.textContent(),/夜間 · KEB-5939/);
  assert.match(await nightGroup.textContent(),/合成志工/);
  assert.doesNotMatch(await nightGroup.textContent(),/日間本人|日間同組/);
  assert.match(await dayGroup.textContent(),/日間 · OTHER-1/);
  assert.match(await dayGroup.textContent(),/日間本人/);
  assert.doesNotMatch(await dayGroup.textContent(),/合成志工|同組志工/);
  await page.locator('[data-close-area]').click();
  await page.locator('.desktop-nav [data-page="map"]').click();
  await page.waitForFunction(()=>!document.querySelector('#mapFallback')?.hidden);
  const stops=await page.evaluate(()=>window.__appTestHooks.visibleShiftStops('成功里','夜間'));
  assert.deepEqual(stops.map(row=>row.address),['中山南路1號','中山南路2號']);
  assert.deepEqual(stops.map(row=>row.time),['00:00','00:05']);
  const dayStops=await page.evaluate(()=>window.__appTestHooks.visibleShiftStops('成功里','日間'));
  assert.deepEqual(dayStops.map(row=>[row.address,row.time]),[['中山南路1號','10:30'],['自訂集合點','10:45']]);
  await page.evaluate(()=>window.__appTestHooks.openShiftStopPopup('成功里','夜間'));
  assert.equal(await page.locator('#areaPopup .assigned-stop-row').count(),2);
  assert.equal(await page.locator('#areaPopup a[href^="https://www.google.com/maps/dir/"]').count(),2);
  assert.equal(await page.locator('#areaPopup a[target="_blank"][rel="noopener noreferrer"]').count(),2);
  await page.locator('[data-close-area]').click();
  await page.locator('#layerNight').check();
  await page.locator('#mapFallback [data-fallback-area="成功里"][data-fallback-shift="夜間"]').click();
  assert.equal(await page.locator('#areaPopup .assigned-stop-row').count(),2);
  assert.match(await page.locator('#areaPopup').textContent(),/夜間 2站/);
  await page.locator('[data-close-area]').click();
  await page.locator('#layerDay').check();
  await page.locator('#mapFallback [data-fallback-area="成功里"][data-fallback-shift="日間"]').click();
  assert.match(await page.locator('#areaPopup').textContent(),/日間 2站/);
  assert.match(await page.locator('#areaPopup').textContent(),/10:30/);
  assert.match(await page.locator('#areaPopup').textContent(),/自訂集合點/);
  await page.locator('[data-close-area]').click();
  await page.locator('#mapFallback [data-fallback-area="成功里"][data-fallback-shift=""]').click();
  assert.equal(await page.locator('#areaPopup .popup-group-section').count(),2);
  await page.locator('[data-close-area]').click();
  await page.locator('.desktop-nav [data-page="reports"]').click();
  await page.locator('#menuBtn').click();
  assert.equal(await page.locator('#modal').evaluate(node=>node.classList.contains('settings-open')),true);
  await page.locator('#closeModal').click();
  assert.equal(await page.locator('#modal').evaluate(node=>node.classList.contains('settings-open')),false);
  await page.locator('.task-complete-btn').first().click();
  await page.locator('#confirmationModal').waitFor();
  await page.locator('#secureLogout').evaluate(node=>node.click());
  await page.waitForFunction(()=>document.querySelector('#confirmationModal')?.hidden===true);
  await page.waitForFunction(()=>document.querySelector('#secureLogout')?.hidden===true);
  assert.equal(observed.api.filter(x=>x==='PATCH tasks').length,0);
  await page.locator('#volunteerLoginBtn').click();
  await page.locator('#secureLoginForm input[name="login"]').fill('0912345678');
  await page.locator('#secureLoginForm input[name="password"]').fill('123456');
  await page.locator('#secureLoginForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  await page.locator('[data-vol-expand]').first().click();
  await page.locator('.task-complete-btn').first().click();
  await page.locator('#confirmationModal').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('#confirmationModal')?.hidden===true);
  assert.equal(observed.api.filter(x=>x==='PATCH tasks').length,0);
  await page.locator('.task-complete-btn').first().click();
  await page.locator('#confirmationAccept').click();
  await page.waitForFunction(()=>document.querySelector('#confirmationModal')?.hidden===true);
  await page.locator('.task-complete-btn').first().click();
  await page.waitForTimeout(180);
  assert.equal(observed.api.filter(x=>x==='PATCH tasks').length,1);
  await page.locator('#secureLogout').click();
  await page.waitForFunction(()=>document.querySelector('#secureLogout')?.hidden===true);
  await page.locator('#volunteerLoginBtn').click();
  await page.locator('#secureLoginForm input[name="login"]').fill('0912345678');
  await page.locator('#secureLoginForm input[name="password"]').fill('123456');
  await page.locator('#secureLoginForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  await page.locator('[data-vol-expand]').first().waitFor();
  assert.equal(await page.locator('[data-vol-expand]').first().getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.volunteer-stop-panel').first().isHidden(),true);
  assert.equal(observed.api.filter(x=>x==='GET tasks').length,4);
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
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#volunteerLoginBtn')?.hidden===false);await page.locator('#volunteerLoginBtn').click();
  await page.locator('#secureLoginForm input[name="login"]').fill('0912345678');await page.locator('#secureLoginForm input[name="password"]').fill('123456');await page.locator('#secureLoginForm button[type="submit"]').click();
  await page.locator('#confirmationCancel').click();
  await page.waitForFunction(()=>document.querySelector('#authStatus')?.textContent==='合成登出失敗');assert.doesNotMatch(await page.locator('#authStatus').textContent(),/暫存已清除/);assert.equal(observed.api.includes('POST device-application'),false);
 });
}

async function secondDeviceApplicationCase(role='volunteer') {
  return withPage({role,secondDevice:true}, async ({page,origin,observed}) => {
    await page.goto(origin, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#volunteerLoginBtn')?.hidden === false);
    await page.locator('#volunteerLoginBtn').click();
    await page.locator('#secureLoginForm input[name="login"]').fill('0912345678');
    await page.locator('#secureLoginForm input[name="password"]').fill('123456');
    await page.locator('#secureLoginForm button[type="submit"]').click();
    await page.locator('#confirmationAccept').click();
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
    await page.locator('#layerDay').check();
    const badge=page.locator('#mapFallback [data-fallback-shift="日間"]').first(),area=await badge.getAttribute('data-fallback-area');
    await badge.click();
    assert.equal(await page.locator('#areaPopup .assigned-stop-list').count(),0);
    assert.equal(await page.locator('#areaPopup').isVisible(),true);
    assert.match(await page.locator('#areaPopup').textContent(),new RegExp(area));
    assert.match(await page.locator('#areaPopup').textContent(),/已分配/);
  });
}

async function adminPinnedMapRegressionCase(){
 return withPage({role:'admin',initiallyLoggedIn:true,exposeAppTestHooks:true},async({page,origin,observed})=>{
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  const info=await page.evaluate(()=>{window.maplibregl={Marker:class{constructor({element}){this.element=element}setLngLat(){return this}addTo(){document.querySelector('#mapBox').append(this.element);return this}remove(){this.element.remove()}}};return window.__appTestHooks.prepareAdminPinnedMap()});
  const pinned=page.locator('.map-marker[title*="｜人工標點待核對"]');
  assert.equal(await pinned.count(),1);
  assert.match(await pinned.getAttribute('title'),new RegExp(info.address.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const aggregate=page.locator(`.map-marker[title*="${info.area}｜${info.shift}選錄"]`);
  assert.equal(await aggregate.count(),info.remaining?1:0);
  if(info.remaining)assert.match(await aggregate.getAttribute('title'),new RegExp(`選錄 ${info.remaining} 站`));
  await pinned.evaluate(node=>node.click());
  assert.match(await page.locator('#toast').textContent(),/人工標點：/);
  assert.equal(await page.locator('#areaPopup').isHidden(),true);
  return {info,api:observed.api,consoleErrors:observed.consoleErrors,pageErrors:observed.pageErrors,external:observed.external};
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
    assert.equal(await page.locator('#secureLoginForm input[name="login"]').getAttribute('placeholder'),'管理員 Email／志工手機');
    assert.equal(await page.locator('#secureLoginForm input[name="login"]').getAttribute('inputmode'),null);
    assert.equal(await page.locator('#secureLoginForm input[name="password"]').getAttribute('placeholder'),'管理員密碼／志工六碼 PIN');
    assert.equal(await page.locator('#secureLoginForm input[name="password"]').getAttribute('inputmode'),null);
    assert.equal(await page.locator('#loginIdentityChoices').count(),1);
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

async function rosterPhoneAndLeaderToggleCase() {
 const roster=[
  {id:'synthetic-member',name:'合成志工甲',phone:'+886989098468',address:'合成地址一',resident_area:'成功里',assignment:'復興里',is_leader:true},
  {id:'synthetic-member-2',name:'合成志工乙',phone:'+886903225788',address:'合成地址二',resident_area:'成功里',assignment:'成功里',is_leader:false},
  {id:'synthetic-admin',name:'合成管理員',phone:'+886900000000',address:'',resident_area:'',assignment:'',is_leader:false},
 ];
 return withPage({role:'admin',initiallyLoggedIn:true,roster},async({page,origin,state,observed})=>{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);
  await page.locator('.desktop-nav [data-page="people"]').click();
  await page.locator('#peopleFilter').selectOption('all');
  await page.locator('#peopleSearch').fill('0989-098-468');
  assert.equal(await page.locator('#peopleList .person-card').count(),1);
  assert.match(await page.locator('#peopleList').textContent(),/合成志工甲/);
  await page.locator('#peopleSearch').fill('0989098468');
  assert.equal(await page.locator('#peopleList .person-card').count(),1);
  await page.locator('.desktop-nav [data-page="areas"]').click();
  const leader=page.locator('button[data-leader="synthetic-member"]');
  assert.equal((await leader.textContent()).trim(),'取消組長');
  await leader.click();
  assert.match(await page.locator('#confirmationMessage').textContent(),/取消.*組長/);
  await page.locator('#confirmationAccept').click();
  await page.waitForFunction(()=>document.querySelector('button[data-leader="synthetic-member"]')?.textContent.includes('設組長'));
  assert.equal(state.roster[0].is_leader,false);
  assert.ok(observed.api.includes('PATCH roster'));
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
    previewSavedSessionReload:await previewSavedSessionReloadCase(),
    volunteerTaskExpansionAndReset:await volunteerTaskExpansionAndResetCase(),
    logoutFailure:await logoutFailureCase(),
    deviceCancelCleanupFailure:await deviceCancelCleanupFailureCase(),
    secondDeviceApplication:await secondDeviceApplicationCase('volunteer'),
    adminDeviceApplication:await secondDeviceApplicationCase('admin'),
    sharedPhoneIdentitySelection:await sharedPhoneIdentitySelectionCase(),
    visibleBootFailure:await bootFailureCase(),
    latestUiMapFallback:await mapFallbackCase(),
    adminPinnedMapRegression:await adminPinnedMapRegressionCase(),
    memberApplicationModal:await memberApplicationModalCase(),
    adminNavigationSmoke:await adminNavigationSmokeCase(),
    rosterPhoneAndLeaderToggle:await rosterPhoneAndLeaderToggleCase(),
  };
  const expectedConsoleError = {
    adminCallback: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    volunteerCallback: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    unauthorizedCallback: message => /403 \(Forbidden\)$/.test(message),
    passwordLogoutReopen: message => /401 \(Unauthorized\)$/.test(message),
    previewSavedSessionReload: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    volunteerTaskExpansionAndReset: message => /(?:401 \(Unauthorized\)|net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector))$/.test(message),
    logoutFailure: message => /(?:401 \(Unauthorized\)|503 \(Service Unavailable\))$/.test(message),
    deviceCancelCleanupFailure: message => /(?:401 \(Unauthorized\)|503 \(Service Unavailable\))$/.test(message),
    secondDeviceApplication: message => /401 \(Unauthorized\)$/.test(message),
    adminDeviceApplication: message => /401 \(Unauthorized\)$/.test(message),
    sharedPhoneIdentitySelection: message => /(?:401 \(Unauthorized\)|503 \(Service Unavailable\))$/.test(message),
    visibleBootFailure: message => /500 \(Internal Server Error\)$/.test(message) || /^Error: 地圖資料無法讀取\n/.test(message),
    latestUiMapFallback: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    adminPinnedMapRegression: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    memberApplicationModal: message => /401 \(Unauthorized\)$/.test(message),
    adminNavigationSmoke: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
    rosterPhoneAndLeaderToggle: message => /net::ERR_(?:FAILED|BLOCKED_BY_CLIENT\.Inspector)$/.test(message),
  };
  for (const [name,result] of Object.entries(results)) {
    if (!result || typeof result !== 'object') continue;
    assert.deepEqual(result.pageErrors, [], `${name} had page errors`);
    const unexpected = result.consoleErrors.filter(message => !expectedConsoleError[name]?.(message));
    assert.deepEqual(unexpected, [], `${name} had unexpected console errors`);
  }
  process.stdout.write(JSON.stringify(results,null,2)+'\n');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
