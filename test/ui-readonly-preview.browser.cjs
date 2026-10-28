const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const host='tainan-achang-online-git-fix-achang-day-routes-memb-4e2e73-tjc1.vercel.app';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({serviceWorkers:'block'});
 const apiRequests=[];
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!==host)return route.abort();
  if(url.pathname.startsWith('/api/')){apiRequests.push(url.pathname);return route.fulfill({status:599,body:'API request forbidden in readonly preview test'});}
  let relative=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'not found'});
  return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 await page.goto(`https://${host}/`,{waitUntil:'domcontentloaded'});
 await page.locator('#previewDemoLogin').waitFor();
 assert.equal(await page.locator('#secureLoginForm').isHidden(),true,'real password form must be hidden');
 assert.equal(await page.locator('#googleOAuthLogin').isHidden(),true,'Google login must be hidden');
 assert.match(await page.locator('#readonlyPreviewNotice').innerText(),/合成排班資料.*不連線/);
 await page.locator('#previewDemoLogin').click();
 assert.deepEqual(pageErrors,[],`readonly preview raised browser errors: ${pageErrors.join('; ')}`);
 assert.match(await page.locator('#modeBanner').innerText(),/唯讀 UI 預覽.*合成資料/);
 assert.equal(await page.locator('#menuBtn').isDisabled(),true,'import/backup menu must be disabled');
 assert.equal(await page.locator('#layerGps').isDisabled(),true,'GPS API toggle must be disabled');
 assert.equal(await page.locator('[data-page="areas"]').first().isHidden(),true,'admin assignment UI must be hidden');
 const expand=page.locator('[data-vol-expand]').first();
 await expand.click();
 const writeButtons=page.locator('[data-vol-complete-group]');
 assert.ok(await writeButtons.count()>0,'synthetic task controls should render');
 for(let i=0;i<await writeButtons.count();i++)assert.equal(await writeButtons.nth(i).isDisabled(),true,'task write control must remain disabled');
 await page.locator('[data-page="map"]').first().click();
 assert.equal(apiRequests.length,0,`readonly UI made API requests: ${apiRequests.join(', ')}`);
 await browser.close();
 console.log('PASS readonly UI preview: synthetic-only, auth hidden, writes disabled, 0 /api requests');
})().catch(async error=>{console.error(error);process.exitCode=1});
