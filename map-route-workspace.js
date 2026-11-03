(()=>{'use strict';
const byId=id=>document.getElementById(id),desktop=matchMedia('(min-width:1200px)');
const page=byId('page-map'),host=byId('page-trucks'),directory=byId('directory'),detail=byId('detail'),controls=host?.querySelector('.controls');
if(!page||!host||!directory||!detail||!controls)return;
const workspace=document.createElement('div');workspace.className='map-route-workspace';
const left=document.createElement('aside');left.className='map-route-left truck-directory-host';left.setAttribute('aria-label','日間夜間車次與搜尋');
const center=document.createElement('div');center.className='map-route-center';
const right=document.createElement('aside');right.className='map-route-right truck-directory-host';right.setAttribute('aria-label','完整路線圖及詳細列表');
const empty=document.createElement('p');empty.className='map-route-empty';empty.textContent='請從左側選擇車次，完整路線圖與詳細列表將同步顯示。';right.append(empty);
workspace.append(left,center,right);
const anchors=[controls,directory,detail].map(node=>{const marker=document.createComment('route-workspace-position');node.before(marker);return {node,marker};});
let mounted=false;
function move(){
 if(desktop.matches&&!mounted){
  [...page.children].forEach(node=>center.append(node));page.append(workspace);left.append(controls,directory);right.append(detail);mounted=true;document.body.classList.add('map-route-desktop');
 }else if(!desktop.matches&&mounted){
  anchors.forEach(({node,marker})=>marker.after(node));[...center.children].forEach(node=>page.append(node));workspace.remove();mounted=false;document.body.classList.remove('map-route-desktop');
 }
 const active=window.AChangRouteDirectory?.activeRoute?.();
 if(active)window.AChangRouteDirectory.openRoute(active,{syncMap:false});
 window.dispatchEvent(new Event('resize'));
}
document.addEventListener('achang:directory-route',event=>{
 empty.hidden=true;
 if(!desktop.matches)return;
 directory.hidden=false;
 if(event.detail?.syncMap===false)return;
 const name=event.detail.route,select=byId('mapRouteLayerSelect'),toggle=byId('layerRoutes');
 if(/^日間[1-6]$/.test(name)&&select&&toggle){toggle.checked=true;select.value=name;select.dispatchEvent(new Event('change',{bubbles:true}));}
 else if(toggle){toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));}
});
byId('mapRouteLayerSelect')?.addEventListener('change',()=>{
 const name=byId('mapRouteLayerSelect').value;if(desktop.matches&&name!=='all')window.AChangRouteDirectory?.openRoute(name,{syncMap:false});
});
document.addEventListener('click',event=>{
 if(!desktop.matches)return;
 const button=event.target.closest('[data-page="trucks"]');
 if(button){document.querySelector('[data-page="map"]')?.click();}
});
desktop.addEventListener('change',move);move();
})();
