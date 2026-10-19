(()=>{'use strict';
const url=new URL('/?entry=volunteer&invite=SYNTHETIC-NOT-A-CREDENTIAL',location.origin).href;
const code=document.getElementById('syntheticInviteUrl'),line=document.getElementById('lineSharePreview'),box=document.getElementById('syntheticQr');
code.textContent=url;
line.href='https://line.me/R/msg/text/?'+encodeURIComponent('台南阿昌志工申請測試連結：'+url);
if(window.QRCode)new QRCode(box,{text:url,width:180,height:180,correctLevel:QRCode.CorrectLevel.M});
else box.textContent='QR 元件載入失敗；測試連結仍顯示於下方。';
})();
