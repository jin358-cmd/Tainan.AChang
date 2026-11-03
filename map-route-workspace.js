(()=>{'use strict';
const byId=id=>document.getElementById(id),desktop=matchMedia('(min-width:1200px)');
const page=byId('page-map'),host=byId('page-trucks'),directory=byId('directory'),detail=byId('detail'),controls=host?.querySelector('.controls');
if(!page||!host||!directory||!detail||!controls)return;
const workspace=document.createElement('div');workspace.className='map-route-workspace';
const left=document.createElement('aside');left.className='map-route-left truck-directory-host';left.setAttribute('aria-label','日間夜間車次與搜尋');
const center=document.createElement('div');center.className='map-route-center';
const right=document.createElement('aside');right.className='map-route-right truck-directory-host';right.setAttribute('aria-label','完整路線圖及詳細列表');
const empty=document.createElement('p');empty.className='map-route-empty';empty.textContent='請從車次列表選擇車次，單點站點卡片複選，連點兩下全選該車次站點。';right.append(empty);
[...page.children].forEach(node=>center.append(node));left.append(controls,directory);right.append(detail);workspace.append(left,center,right);page.append(workspace);host.hidden=true;host.setAttribute('aria-hidden','true');
const jump=document.createElement('button');jump.type='button';jump.className='map-route-list-jump';jump.textContent='選擇車次／人員分配';jump.onclick=()=>left.scrollIntoView({block:'start',behavior:'smooth'});center.prepend(jump);
document.body.classList.add('map-route-integrated');
function resize(){document.body.classList.toggle('map-route-desktop',desktop.matches);const active=window.AChangRouteDirectory?.activeRoute?.();if(active)window.AChangRouteDirectory.openRoute(active,{syncMap:false,reveal:false});window.dispatchEvent(new Event('resize'));}
document.addEventListener('achang:directory-route',event=>{
 empty.hidden=true;directory.hidden=false;if(event.detail?.syncMap===false)return;
 const name=event.detail.route,select=byId('mapRouteLayerSelect'),toggle=byId('layerRoutes');
 if(window.AChangDayRouteLayer?.isRoute(name)&&select&&toggle){toggle.checked=true;select.value=name;select.dispatchEvent(new Event('change',{bubbles:true}));}
 else if(toggle){toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));}
});
document.addEventListener('achang:directory-overview',event=>{empty.hidden=false;detail.hidden=true;const select=byId('mapRouteLayerSelect'),toggle=byId('layerRoutes');if(select&&toggle){toggle.checked=true;select.value=event.detail?.shift==='夜間'?'night-all':event.detail?.shift==='日間'?'all':'all-routes';select.dispatchEvent(new Event('change',{bubbles:true}));}});
byId('mapRouteLayerSelect')?.addEventListener('change',()=>{const name=byId('mapRouteLayerSelect').value;if(window.AChangDayRouteLayer?.isRoute(name))window.AChangRouteDirectory?.openRoute(name,{syncMap:false,reveal:false});});
desktop.addEventListener('change',resize);resize();
})();

