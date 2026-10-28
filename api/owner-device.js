'use strict';
const crypto=require('node:crypto');
const L=require('../lib/server');
const OWNER_EMAIL='jin358@gmail.com';
module.exports=L.run(async(req,res)=>{
 L.method(req,['POST']);
 const p=await L.session(req,res);
 if(p.role!=='admin'||p.status==='suspended')L.problem(403,'僅限主要管理員');
 const raw=String(req.headers['x-achang-device']||'');
 if(!/^[0-9a-f-]{32,64}$/i.test(raw))L.problem(400,'請由原手機開啟正式站');
 const identity=await L.request('/auth/v1/user',{token:p.token});
 if(!identity.ok||identity.data?.id!==p.auth_user_id||String(identity.data?.email||'').toLowerCase()!==OWNER_EMAIL||!identity.data?.email_confirmed_at)L.problem(403,'請以指定管理員 Email 完成驗證');
 const hash=crypto.createHash('sha256').update(raw).digest('hex');
 const current=await L.rest('member_devices?account_id=eq.'+p.id+'&select=id,status,device_id_hash',p.token);
 const records=L.need(current,'無法核對裝置');
 if(records.some(x=>x.status==='approved'))L.problem(409,'已有管理員核准裝置，請改用安全更換流程');
 const existing=records.find(x=>x.device_id_hash===hash);
 if(existing?.status==='revoked')L.problem(403,'已撤銷裝置不可自動恢復');
 const now=new Date().toISOString();
 const r=existing?
 await L.rest('member_devices?id=eq.'+existing.id+'&status=eq.pending&select=id,status',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{status:'approved',approved_at:now,approved_by:p.auth_user_id,revoked_at:null}}):
 await L.rest('member_devices?select=id,status',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:{account_id:p.id,device_id_hash:hash,status:'approved',approved_at:now,approved_by:p.auth_user_id,device_type:'phone',operating_system:'unknown',browser_name:'unknown'}});
 const row=L.need(r,'首次裝置認證失敗')?.[0];if(!row)L.problem(502,'首次裝置認證未寫入');
 return L.json(res,200,{ok:true,deviceStatus:'approved'});
});