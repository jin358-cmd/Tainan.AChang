(()=>{'use strict';const button=document.getElementById('mapSettingsButton'),panel=document.getElementById('mapLayerSettings');if(!button||!panel)return;
const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
button.onclick=event=>{event.stopPropagation();panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));};
panel.addEventListener('click',event=>event.stopPropagation());document.addEventListener('click',close);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();button.focus();}});
})();
