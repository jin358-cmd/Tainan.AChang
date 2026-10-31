'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const type=file=>({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),writes=[];
 try{
  const host='tainan-achang-online-ui-test-tjc1.vercel.app';
  const context=await browser.newContext({viewport:{width:1293,height:760},serviceWorkers:'block'});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.hostname!==host)return route.abort('blockedbyclient');if(url.pathname.startsWith('/api/')){if(request.method()!=='GET')writes.push({method:request.method(),path:url.pathname});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"preview fail closed"}'})}const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));try{return route.fulfill({status:200,contentType:type(file),body:fs.readFileSync(path.join(root,file))})}catch{return route.fulfill({status:404,body:'not found'})}});
  const page=await context.newPage();await page.goto(`https://${host}/`,{waitUntil:'commit',timeout:5000});await page.locator('#previewAdminLogin').click();
  const markers=page.locator('#previewMapMarkers [data-preview-map-focus]'),order=page.locator('#previewMapOrder [data-preview-map-focus]');
  assert.equal(await page.locator('#page-map').getAttribute('class').then(value=>value.includes('active')),true);
  assert.equal(await page.locator('#previewMapArea').inputValue(),'復興里');assert.equal(await page.locator('#previewMapShift').inputValue(),'日間');
  assert.equal(await markers.count(),5);assert.deepEqual(await markers.locator('span').allTextContents(),['06:30','06:45','06:45','07:05','07:30']);
  assert.match((await page.locator('#previewMapCandidates').textContent()),/已指派 0 人/);
  await markers.filter({hasText:'06:45'}).nth(1).click();assert.equal(await order.nth(2).evaluate(node=>node.classList.contains('active')),true);await order.nth(4).click();assert.equal(await markers.nth(4).evaluate(node=>node.classList.contains('active')),true);
  await page.locator('[data-preview-map-select="PM-D2"]').uncheck();assert.equal(await markers.count(),4);assert.deepEqual(await markers.locator('b').allTextContents(),['1','2','3','4']);
  await page.locator('#previewMapStart').selectOption('06:45');await page.locator('#previewMapEnd').selectOption('07:05');assert.equal(await markers.count(),2);assert.deepEqual(await markers.locator('span').allTextContents(),['06:45','07:05']);
  await page.locator('[data-preview-map-reset]').click();assert.equal(await markers.count(),5);assert.equal(await page.locator('#previewMapStart').inputValue(),'');assert.equal(await page.locator('#previewMapEnd').inputValue(),'');
  await page.locator('#previewMapShift').selectOption('夜間');assert.equal(await markers.count(),5);await page.locator('#previewMapStart').selectOption('18:30');await page.locator('#previewMapEnd').selectOption('19:20');assert.equal(await markers.count(),3);assert.deepEqual(await markers.locator('span').allTextContents(),['18:30','19:00','19:20']);
  await page.locator('#previewMapArea').selectOption('光復里');assert.equal(await markers.count(),0);assert.match(await page.locator('#previewMapCandidates').textContent(),/真實站點位置待 GIS 核驗/);
  await page.locator('[data-preview-map-reset]').click();await page.setViewportSize({width:390,height:844});assert.equal(await markers.count(),5);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#previewMapDemo').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
  if(process.env.CAPTURE_PREVIEW)await page.screenshot({path:'/tmp/achang-preview-multistop-map-mobile.png',fullPage:true});
  assert.equal(writes.length,0);
  process.stdout.write(JSON.stringify({status:'PASS',evidence:'local real Chromium + isolated Preview synthetic data',cases:['Preview admin opens directly on five-stop Fuxing daytime map','unassigned stations remain visible','same-time stations keep source order','marker and ordered list focus each other in both directions','deselect renumbers remaining stations','time range is inclusive','day/night filters remain separate','unknown village shows GIS pending instead of fake positions','reset restores five stations','390px mobile has no horizontal overflow','no API writes'],writes:writes.length},null,2)+'\n');
  await context.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
