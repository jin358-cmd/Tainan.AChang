'use strict';const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','PATCH']);const p=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){const [r,m,dev]=await Promise.all([L.rest('member_accounts?select=id,member_id,auth_user_id,role,status,created_at&order=created_at.asc',p.token),L.rest('members?select=id,phone_e164,display_name',p.token),L.rest('member_devices?select=id,account_id,status,created_at,device_type,operating_system,browser_name,approved_at,last_seen_at&order=created_at.asc',p.token)]);const by=new Map(L.need(m,'電話讀取失敗').map(x=>[x.id,x]));return L.json(res,200,{members:L.need(r,'會員名單讀取失敗').filter(x=>x.role==='volunteer').map(x=>({...x,name:by.get(x.member_id)?.display_name||'',phone:by.get(x.member_id)?.phone_e164||'',enabled:x.status==='active'})),devices:L.need(dev,'裝置名單讀取失敗')})}
 const b=L.body(req);
 if(req.method==='PATCH'&&b.deviceId){const id=L.uuid(b.deviceId),status=b.approved?'approved':'revoked';const r=await L.rest('member_devices?id=eq.'+id+'&select=id,status',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{status,approved_at:b.approved?new Date().toISOString():null,approved_by:b.approved?p.auth_user_id:null,revoked_at:b.approved?null:new Date().toISOString()}});return L.json(res,200,{device:L.need(r,'裝置授權修改失敗')[0]})}
 L.problem(410,'會員帳號生命週期已移至新版安全 API');
});
