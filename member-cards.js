(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AChangMemberCards=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function phoneLink(person){const number=String(person.phone||'').replace(/[^+\d]/g,'');let digits=number.replace(/\D/g,'');if(digits.startsWith('8869')&&digits.length===12)digits='0'+digits.slice(3);const label=/^09\d{8}$/.test(digits)?`${digits.slice(0,4)}-${digits.slice(4,7)}-${digits.slice(7)}`:String(person.phone||'');return number?`<a class="phone-link service-phone" href="tel:${esc(number)}" aria-label="撥打 ${esc(person.name)} 的電話">☎ ${esc(label)}</a>`:'<span class="phone-missing">未留電話</span>';}
function renderCard(person,{area=person.assignment||'',areaColor='#176581',leader=false,actions='',allocations=[],className=''}={}){
 const classes=String(className).replace(/[^a-zA-Z0-9 _-]/g,'');
 return `<div class="member ${area?'':'pending'} ${leader?'team-leader':''} ${classes}" data-person="${esc(person.id)}"><div class="member-info"><strong>${esc(person.name)}${leader?' <span class="member-leader-crown" aria-label="組長">👑</span>':''}</strong><small>${area?`<span class="assigned-area-inline" style="--area-color:${esc(areaColor)}">服務里：${esc(area)}</span>`:'待分配'}</small>${allocations.map(text=>`<span class="route-person-allocation">${esc(text)}</span>`).join('')}</div><div class="member-actions">${phoneLink(person)}${actions}</div></div>`;
}
return {renderCard,phoneLink};
});
