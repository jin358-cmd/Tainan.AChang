'use strict';
const L=require('../lib/server');
const AREAS=['復興里','建國里','成功里','光復里','神洲里','勝利里','中興里','復國里','中華里','復華里'];
const mFields='id,source_member_id,display_name,phone_e164,address,resident_area,assignment_note,created_at,updated_at,deleted_at';
const map=(m,alloc)=>({id:m.id,name:m.display_name,phone:m.phone_e164,address:m.address||'',resident_area:m.resident_area||'',assignment:alloc?.village||'',is_leader:!!alloc?.is_leader,updated_at:m.updated_at});
async function allocation(member,token){const r=await L.rest('service_allocations?member_id=eq.'+member+'&select=member_id,village,is_leader',token);return L.need(r,'分派資料讀取失敗')[0]||null}
async function changeArea(id,village,token,leader=false){if(village){const r=await L.rest('service_allocations?on_conflict=member_id&select=member_id,village,is_leader',token,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{member_id:id,village,is_leader:leader}});L.need(r,'服務里指派失敗')}else{const r=await L.rest('service_allocations?member_id=eq.'+id,token,{method:'DELETE'});L.need(r,'移出服務里失敗')}}
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH','DELETE']);const p=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){
  const [m,a]=await Promise.all([L.rest('members?deleted_at=is.null&select='+mFields+'&order=display_name.asc&limit=2000',p.token),L.rest('service_allocations?select=member_id,village,is_leader&limit=2000',p.token)]);
  const all=L.need(m,'名冊讀取失敗').filter(x=>!['ADMIN-','ARCHIVED-'].some(prefix=>String(x.source_member_id||'').startsWith(prefix))),alloc=L.need(a,'服務里讀取失敗'),index=new Map(alloc.map(x=>[x.member_id,x]));
  return L.json(res,200,{people:all.map(x=>map(x,index.get(x.id)))});
 }
 const b=L.body(req);
 if(req.method==='DELETE'){
  const id=L.uuid(b.id),old=await L.getOne('members',id,p.token);
  if(!old||String(old.source_member_id||'').startsWith('ARCHIVED-'))L.problem(404,'名冊沒有這筆人員');
  const reason=L.checkText(b.reason||'管理員自前台封存會員','刪除原因',500);
  const archived=await L.rest('members?id=eq.'+id+'&deleted_at=is.null&select=id,deleted_at',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{deleted_at:new Date().toISOString(),deleted_by:p.auth_user_id,deletion_reason:reason}});
  if(!L.need(archived,'人員封存失敗').length)L.problem(502,'人員未能封存');
  return L.json(res,200,{deleted:true,archived:true});
 }
 const village=b.assignment||null;if(village&&!AREAS.includes(village))L.problem(400,'不支援的里別');
 if(req.method==='POST'){
  const phone=b.phone?L.phone(b.phone):null;
  const x={display_name:L.checkText(b.name,'姓名',80),phone_e164:phone,address:L.checkText(b.address||'','地址',300,true)||null,resident_area:L.checkText(b.residentArea||'','原居住里',40,true)||null};
  const r=await L.rest('members?select=id',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:x});const item=L.need(r,'新增名冊失敗')[0];
  if(village)await changeArea(item.id,village,p.token);return L.json(res,201,{person:map({...x,id:item.id},village?{village}:null)});
 }
 const id=L.uuid(b.id),old=await L.getOne('members',id,p.token);if(!old)L.problem(404,'名冊沒有這筆人員');
 const patch={};if('name'in b)patch.display_name=L.checkText(b.name,'姓名',80);
 if('phone'in b)patch.phone_e164=b.phone?L.phone(b.phone):null;
 if('address'in b)patch.address=L.checkText(b.address||'','地址',300,true)||null;
 if('residentArea'in b)patch.resident_area=L.checkText(b.residentArea||'','原居住里',40,true)||null;
 if(Object.keys(patch).length){const r=await L.rest('members?id=eq.'+id,p.token,{method:'PATCH',body:patch});L.need(r,'名冊更新失敗')}
 if('assignment'in b||'isLeader'in b){const oldAllocation=await allocation(id,p.token);const selected='assignment'in b?village:(oldAllocation?.village||null);const isLeader='isLeader'in b?!!b.isLeader:selected===oldAllocation?.village?!!oldAllocation?.is_leader:false;await changeArea(id,selected,p.token,isLeader)}
 return L.json(res,200,{ok:true});
});
