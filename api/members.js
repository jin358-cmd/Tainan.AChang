'use strict';const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH','DELETE']);const p=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){
  const target=new URL(req.url,'http://localhost').searchParams.get('authUserId');
  if(target){
   const authId=L.uuid(target);
   const accountResult=await L.rest('member_accounts?auth_user_id=eq.'+authId+'&role=eq.volunteer&select=id,member_id,auth_user_id,status,role&limit=1',p.token);
   const account=L.need(accountResult,'會員帳號查詢失敗')?.[0];
   if(!account)L.problem(404,'找不到志工會員');
   const [mem,a,t]=await Promise.all([
    L.rest('members?id=eq.'+account.member_id+'&select=id,display_name,phone_e164&limit=1',p.token),
    L.rest('assignments?member_id=eq.'+account.member_id+'&select=id,service_date,shift,village,truck_number,starts_at,ends_at,cancelled_at&order=service_date.asc,starts_at.asc&limit=2000',p.token),
    L.rest('visit_tasks?member_id=eq.'+account.member_id+'&select=assignment_id,status,completed_at&limit=3000',p.token)
   ]);
   const member=L.need(mem,'會員資料查詢失敗')?.[0];if(!member)L.problem(404,'查無會員資料');
   const assignments=L.need(a,'排班查詢失敗'),visits=L.need(t,'站點紀錄查詢失敗');
   const completed=new Set(visits.filter(v=>v.status==='completed'||v.completed_at).map(v=>v.assignment_id));
   const taiwan=new Date(Date.now()+8*3600000).toISOString();
   const date=taiwan.slice(0,10),clock=taiwan.slice(11,19);
   const history=assignments.map(x=>{
    const isFuture=x.service_date>date||(x.service_date===date&&String(x.starts_at||'').slice(0,8)>clock);
    const isCompleted=completed.has(x.id);
    return {...x,isFuture,isCompleted,state:x.cancelled_at?'已取消':isCompleted?'已完成':isFuture?'未來排班':'歷史排班'};
   });
   return L.json(res,200,{member:{...member,auth_user_id:account.auth_user_id,status:account.status},assignments:history,counts:{future:history.filter(x=>x.isFuture&&!x.cancelled_at).length,historical:history.filter(x=>!x.isFuture&&!x.cancelled_at).length,cancelled:history.filter(x=>x.cancelled_at).length},environment:'test'});
  }
const [r,m,dev]=await Promise.all([L.rest('member_accounts?select=id,member_id,auth_user_id,role,status,approved_at,created_at&order=created_at.asc',p.token),L.rest('members?select=id,phone_e164,display_name',p.token),L.rest('member_devices?select=id,account_id,status,approved_at,created_at&order=created_at.asc',p.token)]);const by=new Map(L.need(m,'電話讀取失敗').map(x=>[x.id,x]));return L.json(res,200,{members:L.need(r,'會員名單讀取失敗').filter(x=>x.role==='volunteer').map(x=>({...x,name:by.get(x.member_id)?.display_name||'',phone:by.get(x.member_id)?.phone_e164||'',enabled:x.status==='active'})),devices:L.need(dev,'裝置名單讀取失敗')})}
 const b=L.body(req);
 if(req.method==='PATCH'&&b.deviceId){const id=L.uuid(b.deviceId),status=b.approved?'approved':'revoked';const r=await L.rest('member_devices?id=eq.'+id+'&select=id,status',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{status,approved_at:b.approved?new Date().toISOString():null,approved_by:b.approved?p.auth_user_id:null,revoked_at:b.approved?null:new Date().toISOString()}});return L.json(res,200,{device:L.need(r,'裝置授權修改失敗')[0]})}
 if(req.method==='DELETE'){
  if(b.action!=='archive')L.problem(400,'請使用會員封存程序，避免破壞歷史排班');
  const id=L.uuid(b.authUserId),expectedPhone=L.phone(b.expectedPhone);
  const result=await L.rest('rpc/achang_archive_volunteer',p.token,{method:'POST',body:{p_auth_user_id:id,p_expected_phone:expectedPhone}});
  return L.json(res,200,L.need(result,'會員封存或排班解除失敗'));
 }
 if(req.method==='PATCH'&&b.action==='recover'){
  const id=L.uuid(b.authUserId),expectedPhone=L.phone(b.expectedPhone);
  const pin=String(b.newPin||'');if(!/^[0-9]{6}$/.test(pin))L.problem(400,'請輸入 6 位數字 PIN');
  if(b.resetDevices!==undefined&&typeof b.resetDevices!=='boolean')L.problem(400,'裝置重設選項錯誤');
  const result=await L.request('/functions/v1/achang-admin-recovery',{method:'POST',token:p.token,body:{authUserId:id,expectedPhone,newPin:pin,resetDevices:b.resetDevices!==false}});
  if(!result.ok)L.problem([400,401,403,404,409].includes(result.status)?result.status:502,result.data?.error||'會員登入障礙解除失敗');
  return L.json(res,200,result.data);
 }
 if(req.method==='PATCH'){const id=L.uuid(b.authUserId),status=b.enabled?'active':'suspended';if(typeof b.enabled!=='boolean')L.problem(400,'啟用狀態錯誤');const r=await L.rest('member_accounts?auth_user_id=eq.'+id+'&role=eq.volunteer&select=id,status',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{status}});const updated=L.need(r,'會員權限更新失敗')?.[0];if(!updated)L.problem(404,'志工會員不存在');if(!b.enabled)await L.rest('member_devices?account_id=eq.'+updated.id,p.token,{method:'PATCH',body:{status:'revoked',revoked_at:new Date().toISOString()}});return L.json(res,200,{member:updated})}
 if(b.role!=='volunteer')L.problem(400,'此版本由管理員管理志工會員');const memberId=L.uuid(b.volunteerId),phone=L.phone(b.phone),password=L.checkText(b.password,'初始密碼',180);if(!(/^[0-9]{6}$/.test(password)||(password.length>=12&&password.length<=180)))L.problem(400,'志工登入 PIN 須為 6 位數字');
 const mem=await L.getOne('members',memberId,p.token);if(!mem||mem.phone_e164!==phone)L.problem(400,'手機號碼與已核對名冊不符');
 const token=p.token,r=await L.request('/functions/v1/achang-admin-provision',{method:'POST',token,body:{memberId,phone,password}});if(!r.ok)L.problem(r.status===409?409:502,r.data?.error||'會員開通失敗');return L.json(res,201,{member:r.data?.member||{member_id:memberId,role:'volunteer',enabled:true}})
});