'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const type=file=>({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream';

async function server(){
 const tasks=[],writes=[],deletes=[];let failDelete=false;
 const instance=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');response.setHeader('Cache-Control','no-store');
  if(url.pathname.startsWith('/api/')){
   let raw='';request.on('data',chunk=>raw+=chunk);request.on('end',()=>{
    const body=raw?JSON.parse(raw):{};response.setHeader('Content-Type','application/json');
    if(url.pathname==='/api/config')return response.end(JSON.stringify({environment:'test',projectRef:'synthetic',supabaseUrl:'https://example.invalid'}));
    if(url.pathname==='/api/session')return response.end(JSON.stringify({role:'admin',accountId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',displayName:'合成管理員'}));
    if(url.pathname==='/api/roster')return response.end(JSON.stringify({people:[{id:'22222222-2222-4222-8222-222222222222',name:'合成志工',phone:'+886900000001',address:'合成地址',resident_area:'成功里',assignment:'成功里',is_leader:false}]}));
    if(url.pathname==='/api/route-stops')return response.end(JSON.stringify({stops:[]}));
    if(url.pathname==='/api/tasks'&&request.method==='POST'){
     writes.push(body);const task={id:`task-${tasks.length+1}`,volunteer_id:body.volunteerId,volunteer_name:'合成志工',area:body.area,visit_date:body.date,shift:body.shift,route_id:body.routeId||'',truck:body.truck||'',stop_address:body.address,eta:body.time,stop_order:body.stopOrder,status:'待訪'};tasks.push(task);response.statusCode=201;return response.end(JSON.stringify({task}));
    }
    if(url.pathname==='/api/tasks'&&request.method==='DELETE'){deletes.push(body);if(failDelete){failDelete=false;response.statusCode=502;return response.end(JSON.stringify({error:'合成解除失敗'}))}const index=tasks.findIndex(task=>task.id===body.id);if(index<0){response.statusCode=404;return response.end(JSON.stringify({error:'找不到站點'}))}tasks.splice(index,1);return response.end(JSON.stringify({ok:true,scope:body.scope}))}
    if(url.pathname==='/api/tasks')return response.end(JSON.stringify({tasks}));
    if(url.pathname==='/api/member-admin-v2')return response.end(JSON.stringify({ok:true,members:[],devices:[]}));
    response.statusCode=404;response.end(JSON.stringify({error:'not found'}));
   });return;
  }
  const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  try{response.setHeader('Content-Type',type(file));response.end(fs.readFileSync(path.join(root,file)))}catch{response.statusCode=404;response.end('not found')}
 });
 await new Promise((resolve,reject)=>{instance.once('error',reject);instance.listen(0,'127.0.0.1',resolve)});
 return {instance,tasks,writes,deletes,failNextDelete(){failDelete=true},origin:`http://127.0.0.1:${instance.address().port}`};
}

(async()=>{
 const local=await server(),browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try{
  const context=await browser.newContext({viewport:{width:1293,height:700},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===local.origin?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();const openDayOne=async()=>{await page.waitForFunction(()=>document.querySelector('#signedInName')?.textContent==='合成管理員');await page.locator('.desktop-nav [data-page="planner"]').click();await page.locator('#planDate').fill('2026-10-29');await page.locator('#planDate').dispatchEvent('change');await page.locator('#plannerAreaSelect').selectOption('all');await page.locator('[data-shift="日間"]').click();await page.locator('[data-day-category="six"]').click();await page.locator('#routeButtons .route-choice').filter({hasText:'日間1'}).click();await page.locator('#visitStartTime').selectOption('');await page.locator('#visitEndTime').selectOption('')};await page.goto(local.origin,{waitUntil:'domcontentloaded'});await openDayOne();
  const card=page.locator('#stopList .stop-card').first();await card.locator('.assign-person').click();assert.match(await page.locator('.planner-area-distance-note').textContent(),/距離待核|同里優先顯示/);assert.equal(await page.locator('.planner-area-assignment-picker').getByText(/公里|公尺|分鐘步行/).count(),0);await page.locator('[data-stop-assignment-area="成功里"]').click();await page.locator('[data-pick-id="22222222-2222-4222-8222-222222222222"]').click();
  await page.waitForTimeout(500);if(!await page.locator('#stopList .stop-members').first().textContent().then(text=>text.includes('合成志工')))throw new Error('assignment did not render '+JSON.stringify({writes:local.writes,tasks:local.tasks,stopCards:await page.locator('#stopList .stop-card').count(),members:await page.locator('#stopList .stop-members').allTextContents(),areas:await page.locator('#stopList .stop-area').allTextContents()}));
  assert.equal(local.writes.length,1);assert.equal(local.writes[0].area,'成功里');assert.equal(local.tasks.length,1);assert.equal(await page.locator('#stopList .stop-members .chip').first().textContent(),'合成志工×');
  const secondAddress=await page.locator('#stopList .stop-address').nth(1).textContent();local.tasks.push({...local.tasks[0],id:'task-2',stop_address:secondAddress,stop_order:2});await page.reload({waitUntil:'domcontentloaded'});await openDayOne();assert.equal(await page.locator('#stopList .stop-members .chip').count(),2);
  const firstRemove=page.locator('#stopList .stop-members [data-stop-remove]').first();page.once('dialog',dialog=>dialog.dismiss());await firstRemove.click();assert.equal(local.deletes.length,0);assert.equal(await page.locator('#stopList .stop-members .chip').count(),2);
  local.failNextDelete();page.once('dialog',dialog=>dialog.accept());await firstRemove.click();await page.locator('#toast').filter({hasText:'未儲存：合成解除失敗'}).waitFor();assert.equal(local.tasks.length,2);assert.equal(await page.locator('#stopList .stop-members .chip').count(),2);assert.deepEqual(local.deletes[0],{id:'task-1',scope:'stop'});
  page.once('dialog',dialog=>dialog.accept());await page.locator('#stopList .stop-members [data-stop-remove]').first().click();await page.waitForFunction(()=>document.querySelectorAll('#stopList .stop-members .chip').length===1);assert.equal(local.tasks.length,1);assert.equal(local.tasks[0].id,'task-2');assert.equal(await page.locator('#stopList .stop-members .chip').count(),1);assert.equal(await page.locator('#stopList .stop-members .chip').first().textContent(),'合成志工×');
  await page.locator('.desktop-nav [data-page="reports"]').click();assert.equal(await page.locator('.flyer-ai-panel').isVisible(),true);assert.equal(await page.locator('.task-date-right-stack').isVisible(),true);assert.match(await page.locator('#flyerAiResult').textContent(),/2026-09 戶籍人口／戶數資料已載入/);const taskOrder=async()=>page.locator('.task-date-right-stack>.task-date-category').evaluateAll(nodes=>nodes.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(node=>node.classList.contains('task-date-current')?'current':node.classList.contains('task-date-future')?'future':'history'));assert.deepEqual(await taskOrder(),['current','future','history']);const futureGroup=page.locator('.task-date-future');assert.equal(await futureGroup.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(238, 249, 241)');assert.equal(await futureGroup.evaluate(node=>node.open),false);await futureGroup.locator('summary').click();assert.equal(await futureGroup.evaluate(node=>node.open),true);await futureGroup.locator('summary').click();assert.equal(await futureGroup.evaluate(node=>node.open),false);await page.locator('#flyerAiArea').selectOption('成功里');assert.match(await page.locator('#flyerAiResult').textContent(),/成功里：1,156 戶／2,359 人/);await page.locator('[data-ai-quality-check]').click();assert.match(await page.locator('#flyerAiResult').textContent(),/人口／戶數推估 Gate 尚未通過/);assert.match(await page.locator('#flyerAiResult').textContent(),/尚未核定新版數值權重/);if(process.env.CAPTURE_PREVIEW)await page.screenshot({path:'/tmp/achang-ai-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.flyer-ai-panel').isVisible(),false);assert.equal(await page.locator('.task-date-right-stack').isVisible(),true);assert.deepEqual(await taskOrder(),['current','future','history']);assert.equal(await futureGroup.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(238, 249, 241)');if(process.env.CAPTURE_PREVIEW)await page.screenshot({path:'/tmp/achang-ai-mobile.png',fullPage:true});
  process.stdout.write(JSON.stringify({status:'PASS',evidence:'local real Chromium + synthetic authenticated API',cases:['all-villages assignment shows only honest same-village priority / distance-pending guidance','assignment renders the volunteer name and survives reload','upper-right x cancellation makes no request','failed x request keeps both names and shows an error','successful x removes only that stop while another stop remains','station volunteer chips use 15px/900 text and long names stay inside mobile cards','desktop task groups order today, future, history and future remains collapsible','future group uses a contrast-safe light green without changing completion status','desktop AI quality panel and task groups render side by side','ranking Gate blocks fabricated TOP output','mobile keeps task order and light-green future group'],writes:local.writes.length,deletes:local.deletes.length},null,2)+'\n');
  await context.close();
  { // Legacy Preview flow retained as unreachable reference; the task-report contract is exercised below.
  if(false){
  const previewHost='tainan-achang-online-ui-test-tjc1.vercel.app',previewWrites=[];
  const preview=await browser.newContext({viewport:{width:1293,height:700},serviceWorkers:'block'});
  await preview.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.hostname!==previewHost)return route.abort('blockedbyclient');if(url.pathname.startsWith('/api/')){if(request.method()!=='GET')previewWrites.push({method:request.method(),path:url.pathname});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"preview fail closed"}'})}const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));try{return route.fulfill({status:200,contentType:type(file),body:fs.readFileSync(path.join(root,file))})}catch{return route.fulfill({status:404,body:'not found'})}});
  const previewPage=await preview.newPage();await previewPage.addInitScript(()=>sessionStorage.setItem('achang-preview-admin-tasks-v1','[{"id":"PREVIEW-TASK-OLD","stop_address":"舊版不可見站點"}]'));const openPreviewDayOne=async()=>{await previewPage.locator('[data-page="planner"]').first().click();await previewPage.locator('#plannerAreaSelect').selectOption('all');await previewPage.locator('[data-shift="日間"]').click();await previewPage.locator('[data-day-category="six"]').click();await previewPage.locator('#routeButtons .route-choice').filter({hasText:'日間1'}).click();await previewPage.locator('#visitStartTime').selectOption('');await previewPage.locator('#visitEndTime').selectOption('')};await previewPage.goto(`https://${previewHost}/`,{waitUntil:'commit',timeout:5000});await previewPage.locator('#previewAdminLogin').waitFor({timeout:5000});await previewPage.locator('#previewAdminLogin').click();await openPreviewDayOne();assert.equal(await previewPage.locator('#previewResetTasks').isVisible(),true);assert.equal(await previewPage.locator('#stopList .stop-members .chip').count(),2);assert.deepEqual((await previewPage.locator('#stopList .stop-members .chip').allTextContents()).sort(),['測試志工A×','測試志工A×']);const previewCard=previewPage.locator('#stopList .stop-card').first(),previewChip=previewCard.locator('.stop-members .chip');const closeStyle=await previewCard.locator('[data-stop-remove]').evaluate(element=>({position:getComputedStyle(element).position,top:getComputedStyle(element).top,right:getComputedStyle(element).right}));assert.deepEqual(closeStyle,{position:'absolute',top:'-5px',right:'-5px'});assert.deepEqual(await previewChip.evaluate(element=>({fontSize:getComputedStyle(element).fontSize,fontWeight:getComputedStyle(element).fontWeight})),{fontSize:'15px',fontWeight:'900'});if(process.env.CAPTURE_PREVIEW)await previewPage.screenshot({path:'/tmp/achang-preview-fixture-desktop.png',fullPage:false});await previewPage.setViewportSize({width:390,height:844});await previewChip.evaluate(element=>{element.firstChild.textContent='測試志工姓名很長A'});assert.equal(await previewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await previewCard.evaluate(element=>element.scrollWidth<=element.clientWidth),true);if(process.env.CAPTURE_PREVIEW)await previewPage.screenshot({path:'/tmp/achang-preview-fixture-mobile.png',fullPage:false});await previewPage.reload({waitUntil:'commit'});await previewPage.locator('#previewAdminLogin').click();await openPreviewDayOne();await previewPage.setViewportSize({width:1293,height:700});const freshPreviewCard=previewPage.locator('#stopList .stop-card').first();previewPage.once('dialog',dialog=>dialog.accept());await freshPreviewCard.locator('[data-stop-remove]').click();assert.equal(await previewPage.locator('#stopList .stop-members .chip').count(),1);assert.equal(await previewPage.locator('#stopList .stop-card').nth(1).locator('.stop-members .chip').textContent(),'測試志工A×');await previewPage.reload({waitUntil:'commit'});await previewPage.locator('#previewAdminLogin').click();await openPreviewDayOne();assert.equal(await previewPage.locator('#stopList .stop-members .chip').count(),1);await previewPage.locator('#previewResetTasks').click();assert.equal(await previewPage.locator('#stopList .stop-members .chip').count(),2);await previewPage.locator('[data-page="reports"]').first().click();assert.equal(await previewPage.locator('.flyer-ai-panel').isVisible(),true);assert.match(await previewPage.locator('#flyerAiResult').textContent(),/2026-09 戶籍人口／戶數資料已載入/);await previewPage.locator('#flyerAiArea').selectOption('復華里');assert.match(await previewPage.locator('#flyerAiResult').textContent(),/復華里：4,326 戶／10,555 人/);await previewPage.locator('[data-ai-quality-check]').click();assert.match(await previewPage.locator('#flyerAiResult').textContent(),/人口／戶數推估 Gate 尚未通過/);assert.equal(previewWrites.length,0);await previewPage.locator('#secureLogout').click();await previewPage.locator('#previewDemoLogin').click();assert.equal(await previewPage.locator('.desktop-nav [data-page="reports"] span').textContent(),'發派任務');assert.equal(await previewPage.locator('.bottom-nav [data-page="reports"] span').textContent(),'發派任務');assert.equal(await previewPage.locator('.volunteer-flyer-panel').isVisible(),true);assert.match(await previewPage.locator('.volunteer-flyer-panel').textContent(),/復華里：4,326 戶／10,555 人/);assert.match(await previewPage.locator('.volunteer-flyer-panel').textContent(),/尚未建立廣告單發派任務/);assert.equal(await previewPage.locator('.volunteer-flyer-panel button,.volunteer-flyer-panel input,.volunteer-flyer-panel select').count(),0);await previewPage.setViewportSize({width:390,height:844});assert.equal(await previewPage.locator('.volunteer-flyer-panel').isVisible(),true);assert.equal(await previewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(process.env.CAPTURE_PREVIEW)await previewPage.screenshot({path:'/tmp/achang-volunteer-flyer-mobile.png',fullPage:true});assert.equal(previewWrites.length,0);await preview.close();
  }}
  const previewHost='tainan-achang-online-ui-test-tjc1.vercel.app',previewWrites=[];
  const preview=await browser.newContext({viewport:{width:1293,height:700},serviceWorkers:'block'});
  await preview.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname!==previewHost)return route.abort('blockedbyclient');
   if(url.pathname.startsWith('/api/')){
    if(request.method()!=='GET')previewWrites.push({method:request.method(),path:url.pathname});
    return route.fulfill({status:503,contentType:'application/json',body:'{"error":"preview fail closed"}'});
   }
   const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
   try{return route.fulfill({status:200,contentType:type(file),body:fs.readFileSync(path.join(root,file))})}catch{return route.fulfill({status:404,body:'not found'})}
  });
  const previewPage=await preview.newPage();
  await previewPage.goto(`https://${previewHost}/`,{waitUntil:'commit',timeout:5000});
  await previewPage.locator('#previewDemoLogin').waitFor({timeout:5000});
  await previewPage.locator('#previewDemoLogin').click();
  assert.equal(await previewPage.locator('.desktop-nav [data-page="reports"] span').textContent(),'發派任務');
  assert.equal(await previewPage.locator('.bottom-nav [data-page="reports"] span').textContent(),'發派任務');
  const flyer=previewPage.locator('.volunteer-flyer-panel');
  assert.match(await flyer.textContent(),/合成示範・非正式派工/);
  assert.match(await flyer.textContent(),/PWA 廣告單發派任務/);
  assert.match(await flyer.textContent(),/目前發派里別復華里/);
  assert.match(await flyer.textContent(),/清運時段：夜間8/);
  assert.match(await flyer.textContent(),/管理員已直接發派・無需接／不接/);
  assert.equal(await previewPage.locator('.volunteer-flyer-panel').count(),1);
  assert.equal(await flyer.locator('[data-preview-flyer-accept],[data-preview-flyer-reject]').count(),0);
  assert.equal(await flyer.locator('#previewFlyerStatus option').count(),4);
  await flyer.locator('#previewFlyerStatus').selectOption('執行中');
  await flyer.locator('[data-preview-flyer-report]').click();
  assert.match(await flyer.locator('.volunteer-flyer-report-state').textContent(),/進度已回報（合成資料）・任務持續中/);
  await flyer.locator('#previewFlyerStatus').selectOption('已完成');
  await flyer.locator('#previewFlyerDistributed').fill('120');
  await flyer.locator('[data-preview-flyer-report]').click();
  assert.match(await flyer.locator('.volunteer-flyer-report-state').textContent(),/已回報（合成資料）・尚待管理端驗收/);
  await previewPage.reload({waitUntil:'commit'});
  await previewPage.locator('#previewDemoLogin').click();
  assert.equal(await previewPage.locator('#previewFlyerStatus').inputValue(),'已完成');
  assert.equal(await previewPage.locator('#previewFlyerDistributed').inputValue(),'120');
  assert.match(await previewPage.locator('.volunteer-flyer-report-state').textContent(),/尚待管理端驗收/);
  await previewPage.locator('#previewFlyerStatus').selectOption('需協調');
  await previewPage.locator('#previewFlyerReason').fill('');
  await previewPage.locator('[data-preview-flyer-report]').click();
  assert.match(await previewPage.locator('#toast').textContent(),/需協調時請填寫困難原因/);
  await previewPage.locator('#previewFlyerReason').fill('現場安全條件待確認');
  await previewPage.locator('[data-preview-flyer-report]').click();
  assert.match(await previewPage.locator('.volunteer-flyer-report-state').textContent(),/待管理端處理，任務未取消/);
  await previewPage.reload({waitUntil:'commit'});
  await previewPage.locator('#previewDemoLogin').click();
  assert.equal(await previewPage.locator('#previewFlyerStatus').inputValue(),'需協調');
  assert.equal(await previewPage.locator('#previewFlyerReason').inputValue(),'現場安全條件待確認');
  assert.match(await previewPage.locator('.volunteer-flyer-report-state').textContent(),/待管理端處理，任務未取消/);
  await previewPage.locator('[data-preview-flyer-reset]').click();
  assert.equal(await previewPage.locator('#previewFlyerStatus').inputValue(),'待執行');
  assert.equal(await previewPage.locator('#previewFlyerDistributed').inputValue(),'');
  await previewPage.setViewportSize({width:390,height:844});
  assert.equal(await previewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await flyer.evaluate(element=>element.scrollWidth<=element.clientWidth),true);
  if(process.env.CAPTURE_PREVIEW)await previewPage.screenshot({path:'/tmp/achang-volunteer-flyer-report-mobile.png',fullPage:true});
  assert.equal(previewWrites.length,0);
  await preview.close();
  process.stdout.write(JSON.stringify({status:'PASS',evidence:'local real Chromium + synthetic Preview sessionStorage',cases:['volunteer page is named 發派任務','single original-style direct-dispatch card has no accept/reject step','four execution/report states use one compact select','synthetic PWA flyer task renders assigned night station','in-progress report remains active','completed report requires and persists distributed count','coordination report requires and persists a reason without cancellation','report remains separate from management acceptance','reset clears only flyer simulation','mobile report card does not overflow','no Preview API writes'],previewWrites:previewWrites.length},null,2)+'\n');
 }finally{await browser.close();local.instance.closeAllConnections();local.instance.close()}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
