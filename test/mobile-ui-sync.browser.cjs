'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');

function markup(){
 return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
 <body class="restored-admin-map">
  <main id="page-reports">
   <details class="task-date-category task-date-history" open><summary>歷史跟巡</summary><div class="task-date-category-body"><details class="task-team"><summary class="task-team-head"><span class="task-team-row task-team-primary"><span class="task-team-identity"><strong><span class="task-leader-crown">👑</span> 王大明</strong><a class="task-team-phone">☎ 0912-345-678</a></span><span class="task-progress-status"><span class="task-progress-label">0/2 已完成</span></span></span><span class="task-team-row task-team-route"><strong>建國里</strong><span class="task-route-separator">・</span><span class="task-team-shift"><span class="legend-pin day">☀</span>日間</span><span class="task-team-plate">KEB-5939</span></span></summary><div class="task-member-list"><div class="task-member-progress"><div><strong>王大明</strong><small>建國里 · 日間 · KEB-5939</small></div><span class="task-progress-status"><span class="task-progress-label">0/1 已完成</span></span></div></div></details></div></details>
  </main>
  <main id="page-map"><div id="mapBox" class="map-box"><div id="areaPopup" class="area-popup map-attached-popup restored-map-popup"><div class="popup-top"><strong>建國里</strong><button type="button" data-close-area>✕</button></div><div class="popup-contacts">${Array.from({length:5},(_,i)=>`<div class="popup-contact${i===0?' leader-row':''}"><strong>合成志工${i+1}${i===0?' <span class="popup-crown">👑</span>':''}</strong><a class="phone-link">☎ 0912-345-67${i}</a></div>`).join('')}</div><button class="popup-detail-btn">前往此里分配 →</button></div><details class="map-source-info"><summary>ⓘ</summary><div><a>© OpenStreetMap contributors</a><span>約略位置，非導航用途</span></div></details></div></main>
 <script>document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.hasAttribute('data-close-area'))document.querySelector('#areaPopup').hidden=true})</script>`;
}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try{
  const results=[];
  for(const width of [390,360]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:800},serviceWorkers:'block'}),page=await context.newPage();
   await page.setContent(markup());
   const layout=await page.evaluate(()=>{const route=document.querySelector('.task-team-route'),popup=document.querySelector('#areaPopup'),contacts=popup.querySelector('.popup-contacts'),fourth=contacts.children[3].getBoundingClientRect(),fifth=contacts.children[4].getBoundingClientRect(),box=contacts.getBoundingClientRect();return {width:innerWidth,routeScroll:route.scrollWidth,routeClient:route.clientWidth,separator:getComputedStyle(document.querySelector('.task-route-separator')).display,icon:getComputedStyle(document.querySelector('.task-team-shift .legend-pin')).display,history:getComputedStyle(document.querySelector('.task-team')).backgroundColor,pink:getComputedStyle(document.querySelector('.task-member-list')).backgroundColor,fourthVisible:fourth.bottom<=box.bottom+1,fifthNeedsScroll:fifth.bottom>box.bottom+1,contactsOverflow:getComputedStyle(contacts).overflowY,sourceCollapsed:document.querySelector('.map-source-info').open===false}});
   assert.notEqual(layout.separator,'none');assert.equal(layout.icon,'grid');assert.ok(layout.routeScroll<=layout.routeClient+1,JSON.stringify(layout));assert.equal(layout.fourthVisible,true);assert.equal(layout.fifthNeedsScroll,true);assert.equal(layout.contactsOverflow,'auto');assert.equal(layout.sourceCollapsed,true);
   await page.locator('[data-close-area]').click();assert.equal(await page.locator('#areaPopup').isHidden(),true);assert.equal(await page.locator('#areaPopup').evaluate(el=>getComputedStyle(el).display),'none');
   results.push(layout);await context.close();
  }
  process.stdout.write(JSON.stringify({status:'PASS',evidence:'synthetic local Chromium render only',viewports:['390x844','360x800'],results},null,2)+'\n');
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
