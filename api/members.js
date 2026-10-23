'use strict';const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH','DELETE']);const p=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){const [r,m,dev]=await Promise.all([L.rest('member_accounts?select=id,member_id,auth_user_id,role,status,created_at&order=created_at.asc',p.token),L.rest('members?select=id,phone_e164,display_name',p.token),L.rest('member_devices?select=id,account_id,status,created_at,device_type,operating_system,browser_name,last_seen_at&order=created_at.asc',p.token)]);const by=new Map(L.need(m,'電話讀取失敗').map(x=>[x.id,x]));return L.json(res,200,{members:L.need(r,'會員名單讀取失敗').filter(x=>x.role==='volunteer').map(x=>({...x,name:by.get(x.member_id)?.display_name||'',phone:by.get(x.member_id)?.phone_e164||'',enabled:x.status==='active'})),devices:L.need(dev,'裝置名單讀取失敗')})}
 const b=L.body(req);
 if(req.method==='PATCH'&&b.deviceId){const id=L.uuid(b.deviceId),status=b.approved?'approved':'revoked';const r=await L.rest('member_devices?id=eq.'+id+'&select=id,status',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{status,approved_at:b.approved?new Date().toISOString():null,approved_by:b.approved?p.auth_user_id:null,revoked_at:b.approved?null:new Date().toISOString()}});return L.json(res,200,{device:L.need(r,'裝置授權修改失敗')[0]})}
 if(req.method==='DELETE'){
  const id=L.uuid(b.authUserId);
  const found=await L.rest('member_accounts?auth_user_id=eq.'+id+'&role=eq.volunteer&select=id,member_id&limit=1',p.token);
  const account=L.need(found,'會員查詢失敗')?.[0];if(!account)L.problem(404,'志工會員不存在');
  // Delete the account first: this immediately invalidates authorization.
  const removed=await L.rest('member_accounts?id=eq.'+account.id+'&select=id',p.token,{method:'DELETE',headers:{Prefer:'return=representation'}});
  if(!L.need(removed,'會員帳號刪除失敗')?.length)L.problem(502,'會員帳號未刪除');
  // Preserve records referenced by assignments, visits, and task history.
  const erased=await L.rest('members?id=eq.'+account.member_id+'&select=id',p.token,{method:'DELETE',headers:{Prefer:'return=representation'}});
  let archived=false;
  if(!erased.ok){
   archived=true;
   const mark=await L.rest('members?id=eq.'+account.member_id+'&select=id',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{source_member_id:'ARCHIVED-'+account.member_id}});
   if(!L.need(mark,'會員已停權但名冊封存失敗')?.length)L.problem(502,'會員名冊封存失敗');
  }
  return L.json(res,200,{deleted:true,archived,retainedHistory:archived});
 }
 if(req.method==='PATCH'){const id=L.uuid(b.authUserId),status=b.enabled?'active':'suspended';if(typeof b.enabled!=='boolean')L.problem(400,'啟用狀態錯誤');const r=await L.rest('member_accounts?auth_user_id=eq.'+id+'&role=eq.volunteer&select=id,status',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{status}});const updated=L.need(r,'會員權限更新失敗')?.[0];if(!updated)L.problem(404,'志工會員不存在');if(!b.enabled)await L.rest('member_devices?account_id=eq.'+updated.id,p.token,{method:'PATCH',body:{status:'revoked',revoked_at:new Date().toISOString()}});return L.json(res,200,{member:updated})}
 if(b.role!=='volunteer')L.problem(400,'此版本由管理員管理志工會員');const memberId=L.uuid(b.volunteerId),phone=L.phone(b.phone),password=L.checkText(b.password,'初始密碼',180);if(!(/^[0-9]{6}$/.test(password)||(password.length>=12&&password.length<=180)))L.problem(400,'志工登入 PIN 須為 6 位數字');
 const mem=await L.getOne('members',memberId,p.token);if(!mem||mem.phone_e164!==phone)L.problem(400,'手機號碼與已核對名冊不符');
 const token=p.token,r=await L.request('/functions/v1/achang-admin-provision',{method:'POST',token,body:{memberId,phone,password}});if(!r.ok)L.problem(r.status===409?409:502,r.data?.error||'會員開通失敗');return L.json(res,201,{member:r.data?.member||{member_id:memberId,role:'volunteer',enabled:true}})
});