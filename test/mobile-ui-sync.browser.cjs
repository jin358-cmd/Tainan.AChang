'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');

function markup(){
 return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
 <body class="restored-admin-map"><style>#mapBox{height:640px;position:relative}.history-growth{height:520px}</style>
  <main id="page-reports">
   <div id="reportsContent" class="people-list task-date-layout"><div class="task-date-left-stack">
    <details class="surface task-date-category task-date-history"><summary>歷史跟巡</summary><div class="task-date-category-body"><details class="task-team" open><summary>歷史資料</summary><div class="history-growth"></div></details></div></details>
    <details class="surface task-date-category task-date-future"><summary>下次跟巡</summary><div class="task-date-category-body"><div class="empty">未來資料</div></div></details>
    </div><details class="surface task-date-category task-date-current" open><summary>當日跟巡</summary><div class="task-date-category-body"><details class="task-team"><summary class="task-team-head"><span class="task-team-row task-team-primary"><span class="task-team-identity"><strong><span class="task-leader-crown">👑</span> 王大明</strong><a class="task-team-phone">☎ 0912-345-678</a></span><span class="task-progress-status"><span class="task-progress-label">0/2 已完成</span></span></span><span class="task-team-row task-team-route"><strong>建國里</strong><span class="task-route-separator">・</span><span class="task-team-shift"><span class="legend-pin day">☀</span>日間</span><span class="task-team-plate">KEB-5939</span></span></summary><div class="task-member-list"><div class="task-member-progress"><div><strong>王大明</strong><small>建國里 · 日間 · KEB-5939</small></div><span class="task-progress-status"><span class="task-progress-label">0/1 已完成</span></span></div></div></details><div style="height:180px"></div></div></details>
   </div>
  </main>
  <main id="page-map"><div id="mapBox" class="map-box"><div id="areaPopup" class="area-popup map-attached-popup restored-map-popup"><div class="popup-top"><strong>建國里</strong><button type="button" data-close-area>✕</button></div><div class="popup-contacts">${Array.from({length:5},(_,i)=>`<div class="popup-contact${i===0?' leader-row':''}"><strong>合成志工${i+1}${i===0?' <span class="popup-crown">👑</span>':''}</strong><a class="phone-link">☎ 0912-345-67${i}</a></div>`).join('')}</div><button class="popup-detail-btn">前往此里分配 →</button></div></div></main>
 <script>function openSyntheticArea(name){const p=document.querySelector('#areaPopup');p.querySelector('.popup-top').innerHTML='<strong>'+name+'</strong><button type="button" data-close-area>✕</button>';p.hidden=false}document.addEventListener('click',e=>{const close=e.target.closest?.('[data-close-area]'),p=document.querySelector('#areaPopup');if(!close||!p||!p.contains(close))return;e.preventDefault();e.stopPropagation();p.hidden=true},true)</script>`;
}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try{
  const results=[];
  for(const width of [390,360]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:800},serviceWorkers:'block'}),page=await context.newPage();
   await page.setContent(markup());
   const layout=await page.evaluate(()=>{
    const route=document.querySelector('.task-date-current .task-team-route'),popup=document.querySelector('#areaPopup'),contacts=popup.querySelector('.popup-contacts'),fourth=contacts.children[3].getBoundingClientRect(),fifth=contacts.children[4].getBoundingClientRect(),box=contacts.getBoundingClientRect();
    const categories=[...document.querySelectorAll('.task-date-category')].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(node=>node.className);
    return {width:innerWidth,routeScroll:route.scrollWidth,routeClient:route.clientWidth,separator:getComputedStyle(document.querySelector('.task-route-separator')).display,icon:getComputedStyle(document.querySelector('.task-team-shift .legend-pin')).display,history:getComputedStyle(document.querySelector('.task-date-history .task-team')).backgroundColor,pink:getComputedStyle(document.querySelector('.task-member-list')).backgroundColor,categories,fourthVisible:fourth.bottom<=box.bottom+1,fifthNeedsScroll:fifth.bottom>box.bottom+1,contactsOverflow:getComputedStyle(contacts).overflowY,customSourceButtons:document.querySelectorAll('.map-source-info').length};
   });
   assert.notEqual(layout.separator,'none');assert.equal(layout.icon,'grid');assert.ok(layout.routeScroll<=layout.routeClient+1,JSON.stringify(layout));assert.equal(layout.fourthVisible,true);assert.equal(layout.fifthNeedsScroll,true);assert.equal(layout.contactsOverflow,'auto');assert.equal(layout.customSourceButtons,0);
   assert.deepEqual(layout.categories,['surface task-date-category task-date-history','surface task-date-category task-date-current','surface task-date-category task-date-future']);
   await page.locator('[data-close-area]').click();assert.equal(await page.locator('#areaPopup').isHidden(),true);assert.equal(await page.locator('#areaPopup').evaluate(el=>getComputedStyle(el).display),'none');
   results.push(layout);await context.close();
  }
  const desktop=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'}),desktopPage=await desktop.newPage();await desktopPage.setContent(markup());
  const desktopLayout=await desktopPage.evaluate(()=>{
   const popup=document.querySelector('#areaPopup'),contacts=popup.querySelector('.popup-contacts'),names=[...contacts.querySelectorAll('strong')],crown=popup.querySelector('.popup-crown'),p=popup.getBoundingClientRect(),history=document.querySelector('.task-date-history'),current=document.querySelector('.task-date-current'),future=document.querySelector('.task-date-future');
   const collapsed={historyHeight:history.getBoundingClientRect().height,currentHeight:current.getBoundingClientRect().height,futureTop:future.getBoundingClientRect().top,currentLeft:current.getBoundingClientRect().left,historyLeft:history.getBoundingClientRect().left};
   history.open=true;
   const expanded={historyHeight:history.getBoundingClientRect().height,currentHeight:current.getBoundingClientRect().height,futureTop:future.getBoundingClientRect().top};
   history.open=false;
   const restoredFutureTop=future.getBoundingClientRect().top;
   return {width:p.width,outerScroll:popup.scrollHeight-popup.clientHeight,contactsOverflow:getComputedStyle(contacts).overflowY,namesSingleLine:names.every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&node.scrollWidth<=node.clientWidth+1),crownTop:parseFloat(getComputedStyle(crown).top),category:{collapsed,expanded,restoredFutureTop}};
  });
  assert.ok(desktopLayout.width>=420,JSON.stringify(desktopLayout));assert.ok(desktopLayout.outerScroll<=1,JSON.stringify(desktopLayout));assert.equal(desktopLayout.contactsOverflow,'auto');assert.equal(desktopLayout.namesSingleLine,true);assert.equal(desktopLayout.crownTop,-2);assert.ok(desktopLayout.category.collapsed.currentLeft>desktopLayout.category.collapsed.historyLeft);assert.ok(desktopLayout.category.collapsed.historyHeight<desktopLayout.category.collapsed.currentHeight);assert.ok(desktopLayout.category.expanded.futureTop>desktopLayout.category.collapsed.futureTop,JSON.stringify(desktopLayout.category));assert.ok(Math.abs(desktopLayout.category.expanded.currentHeight-desktopLayout.category.collapsed.currentHeight)<1,JSON.stringify(desktopLayout.category));assert.ok(Math.abs(desktopLayout.category.restoredFutureTop-desktopLayout.category.collapsed.futureTop)<1);await desktopPage.locator('[data-close-area]').click();await desktopPage.waitForTimeout(300);assert.equal(await desktopPage.locator('#areaPopup').isHidden(),true);await desktopPage.evaluate(()=>openSyntheticArea('中華里'));assert.equal(await desktopPage.locator('#areaPopup').isVisible(),true);await desktopPage.locator('[data-close-area]').click();await desktopPage.waitForTimeout(850);assert.equal(await desktopPage.locator('#areaPopup').isHidden(),true);results.push({desktop:desktopLayout});await desktop.close();
  process.stdout.write(JSON.stringify({status:'PASS',evidence:'synthetic local Chromium render only',viewports:['390x844','360x800','1024x768'],results},null,2)+'\n');
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
