'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['POST']);
 const b=L.body(req),invitationCode=L.checkText(b.invitationCode,'申請邀請碼',4),contactPhone=L.phone(b.phone),pin=String(b.pin||'');
 if(!/^[0-9]{4}$/.test(invitationCode)||!/^[0-9]{6}$/.test(pin))L.problem(400,'邀請碼或六碼 PIN 格式不正確');
 const result=await L.request('/functions/v1/achang-member-apply',{method:'POST',body:{invitationCode,contactPhone,pin}});
 if(!result.ok)L.problem(result.status===429?429:result.status===409?409:result.status===503?503:400,result.data?.error||'會員申請送出失敗');
 L.json(res,201,result.data);
});
